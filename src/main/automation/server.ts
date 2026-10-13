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
  #server: Server | undefined

  constructor(
    private readonly pty: PtyManager,
    private readonly workspace: WorkspaceStore,
    private readonly getWindow: () => BrowserWindow | undefined
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
    await new Promise<void>((resolve) => this.#server?.close(() => resolve()) ?? resolve())
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
    socket.setEncoding('utf8')
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.trim()) void this.#respond(socket, line)
        newline = buffer.indexOf('\n')
      }
    })
  }

  async #respond(socket: Socket, line: string): Promise<void> {
    let request: JsonRpcRequest
    try {
      request = JSON.parse(line) as JsonRpcRequest
    } catch {
      this.#write(socket, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido.' } })
      return
    }

    if (request.auth !== this.#token) {
      this.#write(socket, { jsonrpc: '2.0', id: request.id, error: { code: -32001, message: 'Não autorizado.' } })
      return
    }

    try {
      const result = await this.#dispatch(request.method, (request.params ?? {}) as Params)
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
    socket.write(`${JSON.stringify(response)}\n`)
  }

  async #dispatch(method: string, params: Params): Promise<unknown> {
    if (method === 'system.ping') return { ok: true, protocolVersion: AUTOMATION_PROTOCOL_VERSION }
    if (method === 'canvas.list') {
      const workspace = await this.workspace.load()
      return { terminals: this.pty.list(), notes: workspace.nodes.filter((node) => node.type === 'note'), connections: workspace.connections }
    }
    if (method === 'agent.check') {
      const terminal = this.#terminal(textParam(params.name))
      return this.pty.read(terminal.ownerId, terminal.id, numberParam(params.lines, 200))
    }
    if (method === 'agent.ask') {
      const terminal = this.#terminal(textParam(params.name))
      this.pty.write(terminal.ownerId, terminal.id, `${textParam(params.prompt)}\r`)
      return { ok: true, deliveredTo: params.name }
    }
    if (method === 'agent.dismiss') {
      const terminal = this.#terminal(textParam(params.name))
      this.pty.kill(terminal.ownerId, terminal.id)
      return { ok: true }
    }
    if (method === 'agent.recruit') return this.#recruit(params)
    if (method === 'note.create') return this.#createNote(params)
    if (method === 'note.read') return this.#readNote(params)
    if (method === 'note.write') return this.#writeNote(params)
    if (method === 'nodes.connect') return this.#connectNodes(params)

    throw new Error(`O método ${method} está reservado, mas será implementado na etapa correspondente.`)
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
    return this.pty.create(window.webContents, {
      title: textParam(params.name, 'Agent'),
      cwd: workspace.rootPath,
      ...(commands[preset] ? { command: commands[preset] } : {}),
      env: {
        MAESTRI_ROLE: textParam(params.role),
        MAESTRI_AUTOMATION_ENDPOINT: this.endpoint,
        MAESTRI_AUTOMATION_TOKEN: this.#token
      }
    })
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
    const updated = await this.workspace.update((current) => ({ ...current, nodes: [...current.nodes, node] }))
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
        (node.id === name || node.title.toLocaleLowerCase() === name.toLocaleLowerCase()) && node.type === 'note'
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
    const connection = { id: randomUUID(), fromNodeId: from.id, toNodeId: to.id }
    const updated = await this.workspace.update((current) => ({
      ...current,
      connections: [...current.connections, connection]
    }))
    this.#broadcastWorkspace(updated)
    return connection
  }

  #findNode(workspace: WorkspaceDocument, name: string, type?: string): WorkspaceDocument['nodes'][number] {
    const normalized = name.toLocaleLowerCase()
    const node = workspace.nodes.find(
      (item) =>
        (item.id === name || item.title.toLocaleLowerCase() === normalized) && (!type || item.type === type)
    )
    if (!node) throw new Error(`Nó não encontrado: ${name}`)
    return node
  }

  #broadcastWorkspace(workspace: WorkspaceDocument): void {
    this.getWindow()?.webContents.send('workspace:changed', workspace)
  }
}
