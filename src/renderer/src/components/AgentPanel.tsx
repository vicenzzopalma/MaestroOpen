import { useEffect, useState, useRef } from 'react'
import { Bot, Clock3, X, Play, Square, Cable, Activity } from 'lucide-react'
import type { LoopState, WorkspaceDocument } from '../../../shared/contracts'

type Props = {
  node: WorkspaceDocument['nodes'][number]
  workspace: WorkspaceDocument
  close: () => void
  save: (role: string) => Promise<void>
}

export function AgentPanel({ node, workspace, close, save }: Props): React.JSX.Element {
  const currentRole = typeof node.data.role === 'string' ? node.data.role : ''
  const [role, setRole] = useState(currentRole)
  const [prevNodeId, setPrevNodeId] = useState(node.id)
  const [prevPropRole, setPrevPropRole] = useState(node.data.role)

  if (node.id !== prevNodeId || node.data.role !== prevPropRole) {
    setPrevNodeId(node.id)
    setPrevPropRole(node.data.role)
    setRole(currentRole)
  }

  const [prompt, setPrompt] = useState('')
  const [deadline, setDeadline] = useState(() => {
    const date = new Date(Date.now() + 3600000)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  const [run, setRun] = useState<LoopState>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let disposed = false
    let inFlight = false
    const refresh = (): void => {
      if (inFlight) return
      inFlight = true
      void window.maestri
        .loopList()
        .then((runs) => {
          if (!disposed) {
            setRun(runs.find((r) => r.nodeId === node.id))
            setNow(Date.now())
          }
        })
        .catch((e) => {
          if (!disposed) setError(String(e))
        })
        .finally(() => {
          inFlight = false
        })
    }
    refresh()
    const interval = setInterval(refresh, 1000)
    return () => {
      disposed = true
      clearInterval(interval)
    }
  }, [node.id])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [run?.output])

  const act = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const ids = new Set(
    workspace.connections
      .filter((c) => c.fromNodeId === node.id || c.toNodeId === node.id)
      .flatMap((c) => [c.fromNodeId, c.toNodeId])
  )
  const peers = workspace.nodes.filter((n) => ids.has(n.id) && n.id !== node.id)
  const remaining = run ? Math.max(0, Math.ceil((Date.parse(run.deadline) - now) / 1000)) : 0
  const active = run?.status === 'running'

  return (
    <aside className="agent-panel" aria-label="Configuração do agente">
      <header>
        <div>
          <span className="eyebrow">TERMINAL / AGENTE</span>
          <h2>
            <Bot size={19} />
            {node.title}
          </h2>
        </div>
        <button aria-label="Fechar painel" onClick={close}>
          <X size={18} />
        </button>
      </header>

      <section>
        <label htmlFor="agent-role">Identidade e instruções</label>
        <p>Defina especialidade, responsabilidades e critérios de entrega.</p>
        <textarea
          id="agent-role"
          rows={6}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Você é o engenheiro de frontend. Cuide da interface, acessibilidade e integração…"
        />
        <div className="panel-actions">
          <button disabled={busy} onClick={() => void act(() => save(role))}>
            Salvar identidade
          </button>
          <button
            disabled={busy || active}
            onClick={() =>
              void act(async () => {
                await save(role)
                await window.maestri.automation('agent.bootstrap', { name: node.id })
              })
            }
          >
            Aplicar identidade no terminal
          </button>
        </div>
        <small>
          Inicie com o shell livre. A identidade é aplicada na nova sessão e em cada ciclo contínuo.
        </small>
      </section>

      <section>
        <label>
          <Cable size={14} /> Conexões · {peers.length}
        </label>
        <div className="peer-list">
          {peers.length ? (
            peers.map((p) => (
              <span key={p.id}>
                <i />
                {p.title}
              </span>
            ))
          ) : (
            <p>Use o ícone de cabo nos cartões para conectar sua equipe.</p>
          )}
        </div>
      </section>

      <section>
        <label>
          <Clock3 size={15} /> Refinamento contínuo (Maestro Time)
        </label>
        <p>A IA ativa no terminal revisa e refina o resultado em ciclos até o horário escolhido.</p>
        <textarea
          aria-label="Objetivo do refinamento"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Descreva o objetivo do loop contínuo e os critérios de validação..."
          disabled={active}
        />
        <label className="deadline-label" htmlFor="deadline">
          Encerrar em
        </label>
        <input
          id="deadline"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          disabled={active}
        />
        <div className="run-status">
          <span className={active ? 'live' : ''}>
            {active
              ? 'Em execução'
              : run?.status === 'expired'
                ? 'Prazo atingido'
                : run?.status === 'error'
                  ? 'Falha no ciclo'
                  : run
                    ? 'Interrompido'
                    : 'Pronto para iniciar'}
          </span>
          <b>
            {active
              ? `${Math.floor(remaining / 3600)
                  .toString()
                  .padStart(2, '0')}:${Math.floor((remaining / 60) % 60)
                  .toString()
                  .padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`
              : '—'}
          </b>
        </div>
        <div className="panel-actions">
          {active ? (
            <button
              className="stop"
              onClick={() => void act(() => window.maestri.loopStop(node.id))}
            >
              <Square size={13} /> Parar agora
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || !prompt.trim() || !deadline}
              onClick={() =>
                void act(async () => {
                  await save(role)
                  setRun(
                    await window.maestri.loopStart(
                      node.id,
                      prompt,
                      new Date(deadline).toISOString()
                    )
                  )
                })
              }
            >
              <Play size={13} /> Iniciar ciclos
            </button>
          )}
          <span>Ciclo {run?.cycle ?? 0}</span>
        </div>
        <small>
          As instruções de refinamento são enviadas diretamente para a IA ativa no terminal deste cartão.
        </small>

        {run && (
          <div className="loop-live-container">
            <div className="loop-live-bar">
              <span className={`loop-live-indicator ${active ? 'active' : ''}`}>
                <Activity size={12} />
                {active
                  ? `Ciclo ${run.cycle || 1} em andamento...`
                  : run.status === 'expired'
                    ? 'Ciclos finalizados (prazo atingido)'
                    : run.status === 'error'
                      ? 'Ciclo interrompido com erro'
                      : 'Looping pausado'}
              </span>
              <span className="loop-live-sub">
                {active ? 'Espelhando no terminal' : ''}
              </span>
            </div>
            <pre ref={logRef} className="run-log">
              {run.output || (active ? 'Instruções enviadas para a IA do terminal... Aguardando raciocínio.' : 'Nenhum log registrado.')}
            </pre>
          </div>
        )}
      </section>

      {(error || run?.error) && (
        <div className="panel-error" role="alert">
          {error || run?.error}
        </div>
      )}
    </aside>
  )
}
