import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import { spawn, type IPty } from 'node-pty'
import {
  type CreateTerminalRequest,
  type ShellDescriptor,
  type TerminalCreated
} from '../../shared/contracts'
import { defaultAutomationEndpoint } from '../../shared/automation'
import { IPC } from '../../shared/ipc'
import { discoverShells } from './shell-discovery'

type Session = {
  id: string
  title: string
  owner: WebContents
  ownerId: number
  pty: IPty
  output: string
  shell: ShellDescriptor
}

const MAX_BUFFER_CHARS = 1_000_000

export class PtyManager {
  readonly #sessions = new Map<string, Session>()
  readonly #dataListeners = new Map<string, Set<(data: string) => void>>()

  private cliEnvironment(): Record<string, string> {
    const bin = join(app.getPath('userData'), 'bin')
    mkdirSync(bin, { recursive: true })
    const cli = join(app.getAppPath(), 'out', 'cli', 'index.cjs')
    if (process.platform === 'win32') {
      for (const name of ['maestri', 'omaestri'])
        writeFileSync(
          join(bin, `${name}.cmd`),
          `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" "${cli}" %*\r\n`
        )
    } else {
      for (const name of ['maestri', 'omaestri'])
        writeFileSync(
          join(bin, name),
          `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 "${process.execPath}" "${cli}" "$@"\n`,
          { mode: 0o755 }
        )
    }
    return { PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` }
  }

  listShells(): ShellDescriptor[] {
    return discoverShells()
  }

  create(owner: WebContents, request: CreateTerminalRequest): TerminalCreated {
    if (request.id) {
      const existing = this.#sessions.get(request.id)
      if (existing?.ownerId === owner.id) {
        return { id: existing.id, pid: existing.pty.pid, shell: existing.shell }
      }
    }
    const shells = this.listShells()
    const shell = shells.find((item) => item.id === request.shellId) ?? shells[0]
    if (!shell) throw new Error('Nenhum shell compatível foi encontrado neste sistema.')

    const id = request.id && !this.#sessions.has(request.id) ? request.id : randomUUID()
    const environment = { ...process.env, ...request.env }
    for (const key of Object.keys(environment)) {
      if (key.toLowerCase() === 'path') delete environment[key]
    }
    const targetCwd =
      request.cwd && existsSync(request.cwd) ? request.cwd : (process.env.USERPROFILE ?? process.cwd())

    let pty: IPty
    try {
      pty = spawn(shell.executable, shell.args, {
        name: 'xterm-256color',
        cwd: targetCwd,
        cols: request.cols ?? 100,
        rows: request.rows ?? 30,
        useConpty: process.platform === 'win32',
        env: {
          ...environment,
          ...this.cliEnvironment(),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          MAESTRI_TERMINAL_ID: id,
          MAESTRI_PIPE: defaultAutomationEndpoint(),
          MAESTRI_AUTOMATION_ENDPOINT: defaultAutomationEndpoint()
        }
      })
    } catch {
      pty = spawn(shell.executable, shell.args, {
        name: 'xterm-256color',
        cwd: targetCwd,
        cols: request.cols ?? 100,
        rows: request.rows ?? 30,
        useConpty: false,
        env: {
          ...environment,
          ...this.cliEnvironment(),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          MAESTRI_TERMINAL_ID: id,
          MAESTRI_PIPE: defaultAutomationEndpoint(),
          MAESTRI_AUTOMATION_ENDPOINT: defaultAutomationEndpoint()
        }
      })
    }

    const session: Session = { id, title: request.title, owner, ownerId: owner.id, pty, output: '', shell }
    this.#sessions.set(id, session)

    pty.onData((data) => {
      session.output = `${session.output}${data}`.slice(-MAX_BUFFER_CHARS)
      if (!owner.isDestroyed()) owner.send(IPC.terminalData, { id, data })
      const listeners = this.#dataListeners.get(id)
      if (listeners) {
        for (const listener of listeners) {
          try {
            listener(data)
          } catch {
            // ignore
          }
        }
      }
    })
    pty.onExit(({ exitCode, signal }) => {
      this.#sessions.delete(id)
      if (!owner.isDestroyed()) owner.send(IPC.terminalExit, { id, exitCode, signal })
    })

    if (request.command) pty.write(`${request.command}\r`)
    return { id, pid: pty.pid, shell }
  }

  write(ownerId: number, id: string, text: string): void {
    this.#owned(ownerId, id).pty.write(text)
  }

  writeDirect(idOrTitle: string, text: string): boolean {
    let session = this.#sessions.get(idOrTitle)
    if (!session) {
      const match = this.findByTitle(idOrTitle)
      if (match) session = this.#sessions.get(match.id)
    }
    if (!session) return false
    try {
      session.output = `${session.output}${text}`.slice(-MAX_BUFFER_CHARS)
      if (!session.owner.isDestroyed()) {
        session.owner.send(IPC.terminalData, { id: session.id, data: text })
      }
      return true
    } catch {
      return false
    }
  }

  sendInput(idOrTitle: string, text: string): boolean {
    let session = this.#sessions.get(idOrTitle)
    if (!session) {
      const match = this.findByTitle(idOrTitle)
      if (match) session = this.#sessions.get(match.id)
    }
    if (!session) return false
    try {
      session.pty.write(text)
      return true
    } catch {
      return false
    }
  }

  onTerminalData(idOrTitle: string, listener: (data: string) => void): () => void {
    let session = this.#sessions.get(idOrTitle)
    if (!session) {
      const match = this.findByTitle(idOrTitle)
      if (match) session = this.#sessions.get(match.id)
    }
    const targetId = session ? session.id : idOrTitle
    if (!this.#dataListeners.has(targetId)) {
      this.#dataListeners.set(targetId, new Set())
    }
    const set = this.#dataListeners.get(targetId)!
    set.add(listener)
    return () => {
      set.delete(listener)
      if (set.size === 0) this.#dataListeners.delete(targetId)
    }
  }

  resize(ownerId: number, id: string, cols: number, rows: number): void {
    if (cols < 2 || rows < 1) return
    this.#owned(ownerId, id).pty.resize(cols, rows)
  }

  read(ownerId: number, id: string, lines = 200): string {
    return this.#owned(ownerId, id).output.split(/\r?\n/).slice(-Math.max(1, lines)).join('\n')
  }

  kill(ownerId: number, id: string): void {
    const session = this.#sessions.get(id)
    if (!session || session.ownerId !== ownerId) return
    this.#sessions.delete(id)
    try {
      session.pty.kill()
    } catch {
      // ignore if process already terminated
    }
  }

  disposeOwner(ownerId: number): void {
    for (const [id, session] of this.#sessions.entries()) {
      if (session.ownerId === ownerId) {
        this.#sessions.delete(id)
        try {
          session.pty.kill()
        } catch {
          // ignore
        }
      }
    }
  }

  dispose(): void {
    for (const session of this.#sessions.values()) {
      try {
        session.pty.kill()
      } catch {
        // ignore
      }
    }
    this.#sessions.clear()
  }

  list(): Array<{ id: string; title: string; pid: number; shell: ShellDescriptor }> {
    return [...this.#sessions.values()].map(({ id, title, pty, shell }) => ({
      id,
      title,
      pid: pty.pid,
      shell
    }))
  }

  findByTitle(title: string): { id: string; ownerId: number } | undefined {
    const normalized = title.toLocaleLowerCase()
    const session = [...this.#sessions.values()].find(
      (item) => item.title.toLocaleLowerCase() === normalized
    )
    return session ? { id: session.id, ownerId: session.ownerId } : undefined
  }

  #owned(ownerId: number, id: string): Session {
    const session = this.#sessions.get(id)
    if (!session || session.ownerId !== ownerId) throw new Error(`Terminal não encontrado: ${id}`)
    return session
  }
}
