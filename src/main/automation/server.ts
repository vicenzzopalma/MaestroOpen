import { randomBytes, randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import { dirname } from 'node:path'
import type { BrowserWindow } from 'electron'
import {
  AUTOMATION_PROTOCOL_VERSION,
  defaultAutomationEndpoint,
  runtimeDescriptorPath,
  type JsonRpcRequest,
  type JsonRpcResponse
} from '../../shared/automation'
import { agentContext, type LoopManager } from './loop-manager'
import type { WorkspaceDocument } from '../../shared/contracts'
import type { WorkspaceStore } from '../persistence/workspace-store'
import type { PtyManager } from '../pty/pty-manager'

type Params = Record<string, unknown>

function textParam(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberParam(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export class AutomationServer {
  readonly endpoint = defaultAutomationEndpoint()
  readonly #token = randomBytes(32).toString('hex')
  readonly #bootstrapped = new Set<string>()
  readonly #sockets = new Set<Socket>()
  #server: Server | undefined

  constructor(
    private readonly pty: PtyManager,
    private readonly workspace: WorkspaceStore,
    private readonly getWindow: () => BrowserWindow | undefined,
    private readonly loops?: LoopManager
  ) {}

  async start(): Promise<void> {
    if (process.platform !== 'win32') await unlink(this.endpoint).catch(() => undefined)
    this.#server = createServer((socket) => this.#accept(socket))
    await new Promise<void>((resolve, reject) => {
      this.#server!.once('error', reject)
      this.#server!.listen(this.endpoint, resolve)
    })

    const descriptorPath = runtimeDescriptorPath()
    await mkdir(dirname(descriptorPath), { recursive: true })
    await writeFile(
      descriptorPath,
      JSON.stringify({
        endpoint: this.endpoint,
        token: this.#token,
        protocolVersion: AUTOMATION_PROTOCOL_VERSION,
        pid: process.pid
      }),
      { encoding: 'utf8', mode: 0o600 }
    )
    if (process.platform !== 'win32') await chmod(descriptorPath, 0o600)
  }

  async stop(): Promise<void> {
    for (const socket of this.#sockets) socket.destroy()
    this.#sockets.clear()
    const server = this.#server
    this.#server = undefined
    if (server) {
      await new Promise<void>((resolve) => {
        let finished = false
        const finish = (): void => {
          if (finished) return
          finished = true
          clearTimeout(timeout)
          resolve()
        }
        const timeout = setTimeout(finish, 1_500)
        try {
          server.close(finish)
        } catch {
          finish()
        }
      })
      server.unref()
    }
    const descriptorPath = runtimeDescriptorPath()
    try {
      const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')) as { token?: string }
      if (descriptor.token === this.#token) await unlink(descriptorPath)
    } catch {
      // The descriptor may already have been removed by the OS or another clean shutdown.
    }
    if (process.platform !== 'win32') await unlink(this.endpoint).catch(() => undefined)
  }

  #accept(socket: Socket): void {
    this.#sockets.add(socket)
    socket.once('close', () => this.#sockets.delete(socket))
    socket.on('error', () => this.#sockets.delete(socket))
    socket.setEncoding('utf8')
    let buffer = ''
    let queue: Promise<void> = Promise.resolve()
    const MAX_BUFFER_SIZE = 1_000_000
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      if (buffer.length > MAX_BUFFER_SIZE && buffer.indexOf('\n') < 0) {
        buffer = ''
        return
      }
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.trim()) {
          queue = queue.then(() => this.#respond(socket, line)).catch(() => undefined)
        }
        newline = buffer.indexOf('\n')
      }
    })
  }

  async #respond(socket: Socket, line: string): Promise<void> {
    let request: JsonRpcRequest
    try {
      request = JSON.parse(line) as JsonRpcRequest
    } catch {
      this.#write(socket, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'JSON inválido.' }
      })
      return
    }

    if (request.auth !== this.#token) {
      this.#write(socket, {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32001, message: 'Não autorizado.' }
      })
      return
    }

    try {
      const result = await this.dispatch(request.method, (request.params ?? {}) as Params)
      this.#write(socket, { jsonrpc: '2.0', id: request.id, result })
    } catch (error) {
      this.#write(socket, {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32000, message: error instanceof Error ? error.message : String(error) }
      })
    }
  }

  #write(socket: Socket, response: JsonRpcResponse): void {
    if (!socket.destroyed && socket.writable) {
      socket.write(`${JSON.stringify(response)}\n`)
    }
  }

  async dispatch(method: string, params: Params): Promise<unknown> {
    if (method === 'loop.list') return this.loops?.list() ?? []
    if (method === 'loop.start' || method === 'loop.stop') {
      const doc = await this.workspace.load()
      const node = this.#findNode(doc, textParam(params.name), 'terminal')
      if (!this.loops) throw new Error('Supervisor indisponível.')
      if (method === 'loop.stop') {
        this.loops.stop(node.id)
        return { ok: true }
      }
      return this.loops.start(node.id, textParam(params.prompt), textParam(params.until))
    }
    if (method === 'system.ping' || method === 'system.debug') {
      return {
        ok: true,
        protocolVersion: AUTOMATION_PROTOCOL_VERSION,
        endpoint: this.endpoint,
        clientTerminalId: textParam(params.clientTerminalId) || undefined,
        terminals: this.pty.list().length
      }
    }
    if (method === 'canvas.list') {
      const workspace = await this.workspace.load()
      const clientTerminalId = textParam(params.clientTerminalId)
      const currentNode = workspace.nodes.find(
        (node) => node.type === 'terminal' && textParam(node.data.terminalId) === clientTerminalId
      )
      const connectedNodeIds = new Set(
        workspace.connections
          .filter(
            (connection) =>
              !currentNode ||
              connection.fromNodeId === currentNode.id ||
              connection.toNodeId === currentNode.id
          )
          .flatMap((connection) => [connection.fromNodeId, connection.toNodeId])
      )
      const ptySessions = new Map(this.pty.list().map((session) => [session.id, session]))
      const nodes = workspace.nodes.filter(
        (node) => (!currentNode || connectedNodeIds.has(node.id)) && node.id !== currentNode?.id
      )
      const terminals = nodes.flatMap((node) => {
        if (node.type !== 'terminal') return []
        const session = ptySessions.get(textParam(node.data.terminalId))
        return session ? [{ ...session, role: textParam(node.data.role) || undefined }] : []
      })
      return {
        terminals,
        notes: nodes.filter((node) => node.type === 'note'),
        portals: nodes.filter((node) => node.type === 'portal'),
        connections: workspace.connections.filter(
          (connection) =>
            !currentNode ||
            (connectedNodeIds.has(connection.fromNodeId) &&
              connectedNodeIds.has(connection.toNodeId))
        )
      }
    }
    if (method === 'agent.context') {
      const workspace = await this.workspace.load()
      const node = workspace.nodes.find(
        (n) =>
          n.id === params.nodeId ||
          n.data.terminalId === params.clientTerminalId ||
          n.title === params.name
      )
      if (!node) throw new Error('Terminal não encontrado.')
      return agentContext(workspace, node.id)
    }
    if (method.startsWith('role.') && method !== 'role.assign') {
      const name = textParam(params.name)
      const doc = await this.workspace.load()
      const roles = { ...doc.roles }
      if (method === 'role.list') return roles
      if (method === 'role.show') {
        if (!(name in roles)) throw new Error('Identidade não encontrada.')
        return roles[name]
      }
      if (!name.trim()) throw new Error('Informe o nome da identidade.')
      if (method === 'role.create' && name in roles) throw new Error('Identidade já existe.')
      if (method === 'role.delete') delete roles[name]
      else if (method === 'role.edit') {
        if (
          !roles[name] ||
          !textParam(params.oldText) ||
          !roles[name]!.includes(textParam(params.oldText))
        )
          throw new Error('Trecho não encontrado na identidade.')
        roles[name] = roles[name]!.replace(textParam(params.oldText), textParam(params.newText))
      } else if (method === 'role.create' || method === 'role.write')
        roles[name] = textParam(params.prompt)
      else throw new Error('Operação de identidade desconhecida.')
      const updated = await this.workspace.update((current) => ({ ...current, roles }))
      this.#broadcastWorkspace(updated)
      return { ok: true }
    }
    if (method === 'role.assign') {
      const current = await this.workspace.load()
      const node = this.#findNode(current, textParam(params.recruit), 'terminal')
      const updated = await this.workspace.update((doc) => ({
        ...doc,
        nodes: doc.nodes.map((n) =>
          n.id === node.id
            ? {
                ...n,
                data: {
                  ...n.data,
                  role: params.none
                    ? ''
                    : (current.roles?.[textParam(params.role)] ?? textParam(params.role))
                }
              }
            : n
        )
      }))
      this.#broadcastWorkspace(updated)
      return { ok: true }
    }
    if (method === 'agent.bootstrap') {
      const current = await this.workspace.load()
      const node = this.#findNode(current, textParam(params.name), 'terminal')
      const terminal = this.#terminal(node.title)
      const prompt = agentContext(current, node.id)
      this.pty.write(
        terminal.ownerId,
        terminal.id,
        `\x1b[200~${prompt}\x1b[201~\r`
      )
      return { ok: true }
    }
    if (method === 'agent.check') {
      const doc = await this.workspace.load()
      const node = this.#findNode(doc, textParam(params.name), 'terminal')
      const run = this.loops?.list().find((r) => r.nodeId === node.id)
      if (run) return run.output
      const terminal = this.#terminal(node.title)
      return this.pty.read(terminal.ownerId, terminal.id, numberParam(params.lines, 200))
    }
    if (method === 'agent.ask') {
      if (typeof params.batch === 'string') {
        const batch = JSON.parse(params.batch) as Record<string, string>
        return Promise.all(
          Object.entries(batch).map(([name, prompt]) =>
            this.dispatch('agent.ask', { name, prompt })
          )
        )
      }
      const doc = await this.workspace.load()
      const node = this.#findNode(doc, textParam(params.name), 'terminal')
      if (this.loops?.receive(node.id, textParam(params.prompt)))
        return { ok: true, delivery: 'next-cycle', deliveredTo: node.title }
      const terminal = this.#terminal(node.title)
      this.pty.write(
        terminal.ownerId,
        terminal.id,
        typeof params.raw === 'string'
          ? params.raw
          : `\x1b[200~${textParam(params.prompt)}\x1b[201~\r`
      )
      return { ok: true, deliveredTo: params.name }
    }
    if (method === 'agent.dismiss') {
      const doc = await this.workspace.load()
      const node = this.#findNode(doc, textParam(params.name), 'terminal')
      this.loops?.stop(node.id)
      const terminal = this.#terminal(node.title)
      this.pty.kill(terminal.ownerId, terminal.id)
      return { ok: true }
    }
    if (method === 'agent.recruit') return this.#recruit(params)
    if (method === 'note.create') return this.#createNote(params)
    if (method === 'note.read') return this.#readNote(params)
    if (method === 'note.write') return this.#writeNote(params)
    if (method === 'nodes.connect') return this.#connectNodes(params)

    throw new Error(
      `O método ${method} está reservado, mas será implementado na etapa correspondente.`
    )
  }

  #terminal(name: string): { id: string; ownerId: number } {
    const terminal = this.pty.findByTitle(name)
    if (!terminal) throw new Error(`Terminal não encontrado: ${name}`)
    return terminal
  }

  async #recruit(params: Params): Promise<unknown> {
    const window = this.getWindow()
    if (!window) throw new Error('Nenhuma janela do canvas está disponível.')
    const workspace = await this.workspace.load()
    const preset = textParam(params.preset, 'shell').toLocaleLowerCase()
    const commands: Record<string, string | undefined> = {
      'claude-code': 'claude',
      claude: 'claude',
      codex: 'codex',
      'gemini-cli': 'gemini',
      gemini: 'gemini',
      opencode: 'opencode',
      shell: undefined
    }
    const title = textParam(params.name, 'Agent')
    const session = this.pty.create(window.webContents, {
      title,
      cwd: textParam(params.dir, workspace.rootPath),
      ...(textParam(params.command)
        ? { command: textParam(params.command) }
        : commands[preset] && preset !== 'codex'
          ? { command: commands[preset] }
          : {}),
      env: {
        MAESTRI_ROLE: textParam(params.role),
        MAESTRI_PIPE: this.endpoint,
        MAESTRI_AUTOMATION_ENDPOINT: this.endpoint,
        MAESTRI_AUTOMATION_TOKEN: this.#token
      }
    })
    const node = {
      id: randomUUID(),
      type: 'terminal' as const,
      title,
      frame: {
        x: 180 + workspace.nodes.length * 28,
        y: 150 + workspace.nodes.length * 24,
        width: 520,
        height: 330
      },
      zIndex: Date.now(),
      minimized: false,
      locked: false,
      data: {
        terminalId: session.id,
        shellName: session.shell.name,
        role: workspace.roles?.[textParam(params.role)] ?? textParam(params.role),
        preset
      }
    }
    try {
      const updated = await this.workspace.update((current) => {
        const parent = current.nodes.find((n) => n.data.terminalId === params.clientTerminalId)
        return {
          ...current,
          nodes: [...current.nodes, node],
          connections: parent
            ? [
                ...current.connections,
                { id: randomUUID(), fromNodeId: parent.id, toNodeId: node.id }
              ]
            : current.connections
        }
      })
      this.#broadcastWorkspace(updated)
      if (preset === 'codex' && !textParam(params.command))
        await this.dispatch('agent.bootstrap', { name: node.id })
      return { ...session, node }
    } catch (error) {
      this.pty.kill(window.webContents.id, session.id)
      throw error
    }
  }

  async #createNote(params: Params): Promise<unknown> {
    const title = textParam(params.name, 'Nota')
    const node = {
      id: randomUUID(),
      type: 'note' as const,
      title,
      frame: { x: 120, y: 120, width: 320, height: 240 },
      zIndex: Date.now(),
      minimized: false,
      locked: false,
      data: { content: textParam(params.content) }
    }
    const updated = await this.workspace.update((current) => ({
      ...current,
      nodes: [...current.nodes, node]
    }))
    this.#broadcastWorkspace(updated)
    return node
  }

  async #readNote(params: Params): Promise<string> {
    const node = this.#findNode(await this.workspace.load(), textParam(params.name), 'note')
    const content = textParam(node.data.content)
    const offset = Math.max(0, numberParam(params.offset, 0))
    const limit = Math.max(0, numberParam(params.limit, content.length))
    return content.slice(offset, offset + limit)
  }

  async #writeNote(params: Params): Promise<{ ok: true }> {
    const name = textParam(params.name)
    const updated = await this.workspace.update((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        (node.id === name || node.title.toLocaleLowerCase() === name.toLocaleLowerCase()) &&
        node.type === 'note'
          ? { ...node, data: { ...node.data, content: textParam(params.content) } }
          : node
      )
    }))
    this.#broadcastWorkspace(updated)
    return { ok: true }
  }

  async #connectNodes(params: Params): Promise<unknown> {
    const workspace = await this.workspace.load()
    const from = this.#findNode(workspace, textParam(params.from))
    const to = this.#findNode(workspace, textParam(params.to))
    if (from.id === to.id) throw new Error('Escolha dois nós diferentes.')
    const existing = workspace.connections.find(
      (c) =>
        (c.fromNodeId === from.id && c.toNodeId === to.id) ||
        (c.fromNodeId === to.id && c.toNodeId === from.id)
    )
    if (existing) return existing
    const connection = { id: randomUUID(), fromNodeId: from.id, toNodeId: to.id }
    const updated = await this.workspace.update((current) => ({
      ...current,
      connections: [...current.connections, connection]
    }))
    this.#broadcastWorkspace(updated)
    return connection
  }

  #findNode(
    workspace: WorkspaceDocument,
    name: string,
    type?: string
  ): WorkspaceDocument['nodes'][number] {
    const normalized = name.toLocaleLowerCase()
    const node = workspace.nodes.find(
      (item) =>
        (item.id === name || item.title.toLocaleLowerCase() === normalized) &&
        (!type || item.type === type)
    )
    if (!node) throw new Error(`Nó não encontrado: ${name}`)
    return node
  }

  #broadcastWorkspace(workspace: WorkspaceDocument): void {
    this.getWindow()?.webContents.send('workspace:changed', workspace)
  }
}
