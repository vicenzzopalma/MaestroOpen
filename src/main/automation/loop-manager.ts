import type { LoopState, WorkspaceDocument } from '../../shared/contracts'
import type { WorkspaceStore } from '../persistence/workspace-store'
import type { PtyManager } from '../pty/pty-manager'

type ActiveRun = {
  state: LoopState
  timer?: NodeJS.Timeout
  retryTimer?: NodeJS.Timeout
  idleTimer?: NodeJS.Timeout
  cleanupListener?: () => void
  terminalId?: string
  title?: string
}

export class LoopManager {
  private inbox = new Map<string, string[]>()
  private starting = new Set<string>()
  private runs = new Map<string, ActiveRun>()

  constructor(
    private store: WorkspaceStore,
    private ptyManager?: PtyManager
  ) {}

  private streamToTerminal(terminalId: string, title: string, text: string): void {
    if (!this.ptyManager) return
    if (terminalId && this.ptyManager.writeDirect(terminalId, text)) return
    if (title && this.ptyManager.writeDirect(title, text)) return
  }

  list(): LoopState[] {
    return [...this.runs.values()].map((run) => ({ ...run.state }))
  }

  receive(nodeId: string, message: string): boolean {
    if (this.runs.get(nodeId)?.state.status !== 'running') return false
    const messages = this.inbox.get(nodeId) ?? []
    if (messages.length >= 100) throw new Error('A fila de mensagens está cheia.')
    messages.push(message.slice(0, 20000))
    this.inbox.set(nodeId, messages)
    return true
  }

  stop(id: string, status: 'stopped' | 'expired' = 'stopped'): void {
    const run = this.runs.get(id)
    if (!run || run.state.status !== 'running') return
    run.state.status = status
    clearTimeout(run.timer)
    clearTimeout(run.retryTimer)
    if (run.idleTimer) {
      clearTimeout(run.idleTimer)
      delete run.idleTimer
    }
    if (run.cleanupListener) {
      run.cleanupListener()
      delete run.cleanupListener
    }
    const msg =
      status === 'expired'
        ? '\r\n\x1b[1;32m🏁 [MAESTRO TIME] Prazo final atingido. Refinamento contínuo finalizado com sucesso.\x1b[0m\r\n'
        : '\r\n\x1b[1;31m⏹ [MAESTRO TIME] Refinamento contínuo interrompido.\x1b[0m\r\n'
    this.streamToTerminal(run.terminalId ?? '', run.title ?? id, msg)
  }

  dispose(): void {
    for (const id of this.runs.keys()) this.stop(id)
  }

  async start(nodeId: string, prompt: string, deadline: string): Promise<LoopState> {
    const remaining = Date.parse(deadline) - Date.now()
    if (!prompt.trim() || !Number.isFinite(remaining) || remaining <= 0 || remaining > 604800000)
      throw new Error('Informe um objetivo e um prazo futuro de até sete dias.')
    if (
      this.starting.has(nodeId) ||
      this.runs.get(nodeId)?.state.status === 'running'
    )
      throw new Error('Este agente já tem um ciclo ativo.')
    this.starting.add(nodeId)
    let workspace: WorkspaceDocument
    try {
      workspace = await this.store.load()
    } finally {
      this.starting.delete(nodeId)
    }
    const node = workspace.nodes.find((node) => node.id === nodeId && node.type === 'terminal')
    if (!node) throw new Error('Terminal não encontrado.')
    const terminalId = typeof node.data.terminalId === 'string' ? node.data.terminalId : ''
    const title = node.title || ''
    const run: ActiveRun = {
      state: { nodeId, status: 'running', deadline, cycle: 0, output: '' },
      terminalId,
      title
    }
    this.runs.set(nodeId, run)
    run.timer = setTimeout(() => this.stop(nodeId, 'expired'), remaining)

    const cycle = async (): Promise<void> => {
      if (run.state.status !== 'running') return
      if (Date.now() >= Date.parse(deadline)) {
        this.stop(nodeId, 'expired')
        return
      }
      try {
        const current = await this.store.load()
        if (run.state.status !== 'running') return
        if (Date.now() >= Date.parse(deadline)) {
          this.stop(nodeId, 'expired')
          return
        }
        const agent = current.nodes.find((n) => n.id === nodeId)
        if (!agent) throw new Error('O terminal foi removido.')
        const targetTermId = String(agent.data.terminalId ?? '')
        const agentTitle = agent.title
        const context = agentContext(current, nodeId)
        const messages = (this.inbox.get(nodeId) ?? []).join('\n')
        this.inbox.delete(nodeId)
        const remainingMs = Date.parse(deadline) - Date.now()
        const remainingMinutes = Math.max(1, Math.round(remainingMs / 60000))
        run.state.cycle++

        const instructions = `${context}

=== MODO MAESTRO TIME: REFINAMENTO CONTÍNUO (CICLO ${run.state.cycle}) ===
Objetivo Principal: ${prompt}
Prazo Final: ${deadline} (~${remainingMinutes} minutos restantes).

DIRETRIZES DO CICLO:
1. Continue aprimorando, auditando e testando o código conforme o objetivo principal.
2. Audite o que foi produzido procurando vulnerabilidades, edge-cases e testes.
3. Se houver mensagens da equipe ou conexões, coordene com elas.
4. Ao concluir as alterações deste ciclo, apresente um breve resumo do que foi feito.
${messages ? `\nMensagens recentes da equipe:\n${messages}\n` : ''}`

        const terminalBanner = [
          `\r\n\x1b[1;36m┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\x1b[0m\r\n`,
          `\x1b[1;36m┃\x1b[0m \x1b[1;37mMAESTRO TIME · CICLO ${run.state.cycle}\x1b[0m \x1b[90m(Restante: ~${remainingMinutes} min | Prazo: ${new Date(deadline).toLocaleTimeString()})\x1b[0m\r\n`,
          `\x1b[1;36m┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\x1b[0m\r\n`,
          `\x1b[36m› Objetivo:\x1b[0m ${prompt}\r\n`,
          `\x1b[90m› Enviando instruções diretamente para a IA ativa no terminal...\x1b[0m\r\n\r\n`
        ].join('')
        this.streamToTerminal(targetTermId, agentTitle, terminalBanner)

        const cycleHeader = `\n── Ciclo ${run.state.cycle} · ${new Date().toLocaleTimeString()} (Tempo restante: ~${remainingMinutes} min) ──\n`
        run.state.output += cycleHeader

        const promptCommand = `\x1b[200~${instructions.trim()}\x1b[201~\r`
        const sent =
          (this.ptyManager && targetTermId && this.ptyManager.sendInput(targetTermId, promptCommand)) ||
          (this.ptyManager && agentTitle && this.ptyManager.sendInput(agentTitle, promptCommand))

        if (!sent) {
          throw new Error(
            `Não foi possível enviar o ciclo para o terminal "${agentTitle}". Verifique se ele está aberto.`
          )
        }

        let lastActivity = Date.now()
        let hasOutput = false
        const cycleStartTime = Date.now()

        if (run.cleanupListener) {
          run.cleanupListener()
          delete run.cleanupListener
        }

        const listener = (data: string): void => {
          lastActivity = Date.now()
          hasOutput = true
          run.state.output = (run.state.output + data).slice(-100000)
        }

        const unsubId = targetTermId && this.ptyManager ? this.ptyManager.onTerminalData(targetTermId, listener) : undefined
        const unsubTitle = agentTitle && this.ptyManager ? this.ptyManager.onTerminalData(agentTitle, listener) : undefined
        run.cleanupListener = () => {
          if (unsubId) unsubId()
          if (unsubTitle) unsubTitle()
        }

        const checkIdle = (): void => {
          if (run.state.status !== 'running') return
          const elapsedSinceInput = Date.now() - cycleStartTime
          const idleTime = Date.now() - lastActivity

          // Aguarda pelo menos 8s após o envio. Se houve saída e ficou 12s em silêncio (ou após 10min de teto), encerra o ciclo.
          const isComplete =
            (hasOutput && elapsedSinceInput >= 8000 && idleTime >= 12000) ||
            elapsedSinceInput >= 600000

          if (isComplete) {
            if (run.cleanupListener) {
              run.cleanupListener()
              delete run.cleanupListener
            }
            if (Date.now() >= Date.parse(deadline)) {
              this.stop(nodeId, 'expired')
              return
            }
            const successMsg = `\r\n\x1b[1;32m✔ [MAESTRO TIME] Ciclo ${run.state.cycle} concluído pela IA do terminal. Próximo refinamento em 5s...\x1b[0m\r\n`
            run.state.output += successMsg
            this.streamToTerminal(targetTermId, agentTitle, successMsg)
            run.retryTimer = setTimeout(() => void cycle(), 5000)
          } else {
            run.idleTimer = setTimeout(checkIdle, 3000)
          }
        }

        run.idleTimer = setTimeout(checkIdle, 3000)
      } catch (error) {
        const errStr = error instanceof Error ? error.message : String(error)
        const alertMsg = `\r\n\x1b[1;31m✖ [MAESTRO TIME] Erro no supervisor: ${errStr}\x1b[0m\r\n`
        run.state.output += alertMsg
        this.streamToTerminal(run.terminalId ?? '', run.title ?? nodeId, alertMsg)
        run.state.status = 'error'
        run.state.error = errStr
        clearTimeout(run.timer)
        clearTimeout(run.retryTimer)
        if (run.idleTimer) clearTimeout(run.idleTimer)
        if (run.cleanupListener) {
          run.cleanupListener()
          delete run.cleanupListener
        }
      }
    }
    void cycle()
    return { ...run.state }
  }
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return ''
}

export function agentContext(workspace: WorkspaceDocument, nodeId: string): string {
  const node = workspace.nodes.find((n) => n.id === nodeId)
  const ids = new Set(
    workspace.connections
      .filter((c) => c.fromNodeId === nodeId || c.toNodeId === nodeId)
      .flatMap((c) => [c.fromNodeId, c.toNodeId])
  )
  const peers = workspace.nodes.filter((n) => n.id !== nodeId && ids.has(n.id))
  return `Você é ${node?.title ?? 'Agente'} no workspace ${workspace.name}.\nIdentidade: ${safeString(node?.data.role)}\nNós conectados: ${peers.map((n) => `${n.title} (${n.type}): ${safeString(n.data.role ?? n.data.content)}`).join('\n') || 'Nenhum ainda'}.\nUse maestri list para descobrir conexões atuais, maestri ask "Nome" "mensagem" para entregar uma mensagem e maestri check "Nome" para ler a saída. As mensagens são assíncronas. Coordene alterações para evitar conflitos.`
}
