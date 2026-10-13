import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import { spawn, type IPty } from 'node-pty'
import {
  IPC,
  type CreateTerminalRequest,
  type ShellDescriptor,
  type TerminalCreated
} from '../../shared/contracts'
import { discoverShells } from './shell-discovery'

type Session = {
  id: string
  title: string
  ownerId: number
  pty: IPty
  output: string
  shell: ShellDescriptor
}

const MAX_BUFFER_CHARS = 1_000_000

export class PtyManager {
  readonly #sessions = new Map<string, Session>()

  listShells(): ShellDescriptor[] {
    return discoverShells()
  }

  create(owner: WebContents, request: CreateTerminalRequest): TerminalCreated {
    const shells = this.listShells()
    const shell = shells.find((item) => item.id === request.shellId) ?? shells[0]
    if (!shell) throw new Error('Nenhum shell compatível foi encontrado neste sistema.')

    const id = randomUUID()
    const pty = spawn(shell.executable, shell.args, {
      name: 'xterm-256color',
      cwd: request.cwd,
      cols: request.cols ?? 100,
      rows: request.rows ?? 30,
      env: {
        ...process.env,
        ...request.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        MAESTRI_TERMINAL_ID: id
      }
    })

    const session: Session = { id, title: request.title, ownerId: owner.id, pty, output: '', shell }
    this.#sessions.set(id, session)

    pty.onData((data) => {
      session.output = `${session.output}${data}`.slice(-MAX_BUFFER_CHARS)
      if (!owner.isDestroyed()) owner.send(IPC.terminalData, { id, data })
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

  resize(ownerId: number, id: string, cols: number, rows: number): void {
    if (cols < 2 || rows < 1) return
    this.#owned(ownerId, id).pty.resize(cols, rows)
  }

  read(ownerId: number, id: string, lines = 200): string {
    return this.#owned(ownerId, id).output.split(/\r?\n/).slice(-Math.max(1, lines)).join('\n')
  }

  kill(ownerId: number, id: string): void {
    const session = this.#owned(ownerId, id)
    session.pty.kill()
    this.#sessions.delete(id)
  }

  disposeOwner(ownerId: number): void {
    for (const session of this.#sessions.values()) {
      if (session.ownerId === ownerId) {
        session.pty.kill()
        this.#sessions.delete(session.id)
      }
    }
  }

  dispose(): void {
    for (const session of this.#sessions.values()) session.pty.kill()
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
