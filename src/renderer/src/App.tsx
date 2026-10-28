import {
  Bot,
  Cable,
  Command,
  FilePlus2,
  FileText,
  FolderClosed,
  FolderPlus,
  FolderTree,
  Globe2,
  Layers,
  Lock,
  Map,
  Maximize2,
  Minimize2,
  MousePointer2,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings2,
  Terminal,
  Type,
  Trash2,
  Unlock,
  X
} from 'lucide-react'
import { useAtom } from 'jotai'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from 'react'
import type { ShellDescriptor, WorkspaceDocument } from '../../shared/contracts'
import { AgentPanel } from './components/AgentPanel'
import { TerminalCard } from './components/TerminalCard'
import { selectedNodeIdsAtom, viewportAtom, workspaceAtom } from './state/canvas'
import {
  calculatePhysicsCable,
  calculateDraftCable,
  determineOptimalPorts,
  type PortSide
} from './cable-physics'

type CanvasNode = WorkspaceDocument['nodes'][number]
type NodeType = CanvasNode['type']

export interface PendingConnection {
  fromNodeId: string
  fromSide?: PortSide
  currentPosition?: { x: number; y: number }
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2.5
const NODE_MIN_WIDTH = 240
const NODE_MIN_HEIGHT = 150

const tools: Array<{ type: NodeType; label: string; icon: typeof Command; shortcut: string }> = [
  { type: 'terminal', label: 'Adicionar terminal', icon: Terminal as unknown as typeof Command, shortcut: 'T' },
  { type: 'note', label: 'Adicionar nota', icon: FileText as unknown as typeof Command, shortcut: 'N' },
  { type: 'fileTree', label: 'Árvore de Arquivos', icon: FolderTree, shortcut: 'F' },
  { type: 'portal', label: 'Portal', icon: Globe2, shortcut: 'P' }
]

function stringData(node: CanvasNode, key: string, fallback = ''): string {
  const value = node.data[key]
  return typeof value === 'string' ? value : fallback
}

function nodeIcon(type: NodeType): typeof Command {
  if (type === 'terminal') return Bot
  if (type === 'note' || type === 'text') return FileText
  if (type === 'fileTree') return FolderTree
  return Globe2
}

export function App(): React.JSX.Element {
  const canvasRef = useRef<HTMLElement>(null)
  const initializedRef = useRef(false)
  const [workspace, setWorkspace] = useAtom(workspaceAtom)
  const [viewport, setViewport] = useAtom(viewportAtom)
  const [selectedIds, setSelectedIds] = useAtom(selectedNodeIdsAtom)
  const [shells, setShells] = useState<ShellDescriptor[]>([])
  const [loaded, setLoaded] = useState(false)
  const [agentPanelId, setAgentPanelId] = useState<string>()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null)
  const [startupError, setStartupError] = useState<string | undefined>(() =>
    window.maestri ? undefined : 'A ponte segura do Electron não foi carregada.'
  )

  const persist = useCallback((next: WorkspaceDocument) => {
    void window.maestri.saveWorkspace(next).catch((error: unknown) => {
      setStartupError(error instanceof Error ? error.message : String(error))
    })
  }, [])

  useEffect(() => {
    if (!window.maestri || initializedRef.current) return
    initializedRef.current = true

    void Promise.all([window.maestri.listShells(), window.maestri.loadWorkspace()])
      .then(async ([availableShells, document]) => {
        setShells(availableShells)
        let nodes = [...document.nodes]

        if (!nodes.some((node) => node.type === 'terminal')) {
          nodes.push({
            id: crypto.randomUUID(),
            type: 'terminal',
            title: 'Lead',
            frame: { x: 180, y: 150, width: 520, height: 330 },
            zIndex: 1,
            minimized: false,
            locked: false,
            data: {}
          })
        }
        if (!nodes.some((node) => node.type === 'note')) {
          nodes.push({
            id: crypto.randomUUID(),
            type: 'note',
            title: 'Arquitetura',
            frame: { x: 790, y: 185, width: 340, height: 260 },
            zIndex: 2,
            minimized: false,
            locked: false,
            data: { content: '# Canvas multiagente\n\nArraste, redimensione e edite este cartão.' }
          })
        }

        nodes = await Promise.all(
          nodes.map(async (node) => {
            if (node.type !== 'terminal') return node
            try {
              const session = await window.maestri.createTerminal({
                ...(stringData(node, 'terminalId') ? { id: stringData(node, 'terminalId') } : {}),
                title: node.title,
                cwd: document.rootPath
              })
              return {
                ...node,
                data: { ...node.data, terminalId: session.id, shellName: session.shell.name }
              }
            } catch (error) {
              return {
                ...node,
                data: {
                  ...node.data,
                  terminalError: error instanceof Error ? error.message : String(error)
                }
              }
            }
          })
        )

        const restored = { ...document, nodes }
        setWorkspace(restored)
        setLoaded(true)
        persist(restored)
      })
      .catch((error: unknown) =>
        setStartupError(error instanceof Error ? error.message : String(error))
      )
  }, [persist, setWorkspace])

  useEffect(() => {
    if (!loaded || !workspace) return
    const timeout = window.setTimeout(() => persist(workspace), 250)
    return () => window.clearTimeout(timeout)
  }, [loaded, persist, workspace])

  useEffect(
    () => window.maestri?.onWorkspaceChanged((document) => setWorkspace(document)),
    [setWorkspace]
  )

  const updateNode = useCallback(
    (id: string, change: (node: CanvasNode) => CanvasNode) => {
      setWorkspace((current) =>
        current
          ? {
              ...current,
              nodes: current.nodes.map((node) => (node.id === id ? change(node) : node))
            }
          : current
      )
    },
    [setWorkspace]
  )

  const worldPositionNearCenter = useCallback((): { x: number; y: number } => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const offset = (workspace?.nodes.length ?? 0) * 18
    return {
      x: ((rect?.width ?? 900) / 2 - viewport.x) / viewport.zoom - 210 + offset,
      y: ((rect?.height ?? 650) / 2 - viewport.y) / viewport.zoom - 130 + offset
    }
  }, [viewport, workspace?.nodes.length])

  const createNode = useCallback(
    async (type: NodeType, position?: { x: number; y: number }) => {
      if (!workspace) return
      const at = position ?? worldPositionNearCenter()
      const count = workspace.nodes.filter((node) => node.type === type).length + 1
      const base: CanvasNode = {
        id: crypto.randomUUID(),
        type,
        title:
          type === 'terminal'
            ? `Terminal ${count}`
            : type === 'note'
              ? `Nota ${count}`
              : type === 'portal'
                ? `Portal ${count}`
                : `Arquivos ${count}`,
        frame: {
          x: at.x,
          y: at.y,
          width: type === 'terminal' ? 520 : type === 'portal' ? 430 : 340,
          height: type === 'terminal' ? 330 : type === 'portal' ? 300 : 260
        },
        zIndex: Math.max(0, ...workspace.nodes.map((node) => node.zIndex)) + 1,
        minimized: false,
        locked: false,
        data:
          type === 'note'
            ? { content: '# Nova nota\n\nEscreva aqui.' }
            : type === 'portal'
              ? { url: 'http://localhost:3000' }
              : {}
      }

      if (type === 'terminal') {
        try {
          const session = await window.maestri.createTerminal({
            title: base.title,
            cwd: workspace.rootPath
          })
          base.data = { terminalId: session.id, shellName: session.shell.name }
        } catch (error) {
          base.data = { terminalError: error instanceof Error ? error.message : String(error) }
        }
      }

      setWorkspace((current) =>
        current ? { ...current, nodes: [...current.nodes, base] } : current
      )
      setSelectedIds(new Set([base.id]))
    },
    [setSelectedIds, setWorkspace, workspace, worldPositionNearCenter]
  )

  const removeNode = useCallback(
    (node: CanvasNode) => {
      void window.maestri.loopStop(node.id)
      const terminalId = stringData(node, 'terminalId')
      if (terminalId) void window.maestri.killTerminal(terminalId).catch(() => undefined)
      setWorkspace((current) =>
        current
          ? {
              ...current,
              nodes: current.nodes.filter((item) => item.id !== node.id),
              connections: current.connections.filter(
                (connection) => connection.fromNodeId !== node.id && connection.toNodeId !== node.id
              )
            }
          : current
      )
      setSelectedIds((current) => {
        const next = new Set(current)
        next.delete(node.id)
        return next
      })
    },
    [setSelectedIds, setWorkspace]
  )

  const updateAttachedCables = useCallback(
    (nodeId: string, currentX: number, currentY: number) => {
      if (!workspace) return
      const movingNode = workspace.nodes.find((n) => n.id === nodeId)
      if (!movingNode) return

      const movingHeight = movingNode.minimized ? 39 : movingNode.frame.height
      const movingFrame = {
        x: currentX,
        y: currentY,
        width: movingNode.frame.width,
        height: movingHeight
      }

      for (const conn of workspace.connections) {
        if (conn.fromNodeId !== nodeId && conn.toNodeId !== nodeId) continue

        const fromNode = conn.fromNodeId === nodeId ? movingNode : workspace.nodes.find((n) => n.id === conn.fromNodeId)
        const toNode = conn.toNodeId === nodeId ? movingNode : workspace.nodes.find((n) => n.id === conn.toNodeId)
        if (!fromNode || !toNode) continue

        const fromFrame =
          conn.fromNodeId === nodeId
            ? movingFrame
            : {
                x: fromNode.frame.x,
                y: fromNode.frame.y,
                width: fromNode.frame.width,
                height: fromNode.minimized ? 39 : fromNode.frame.height
              }

        const toFrame =
          conn.toNodeId === nodeId
            ? movingFrame
            : {
                x: toNode.frame.x,
                y: toNode.frame.y,
                width: toNode.frame.width,
                height: toNode.minimized ? 39 : toNode.frame.height
              }

        const { fromSide, toSide } = determineOptimalPorts(
          fromFrame,
          toFrame,
          conn.fromSide,
          conn.toSide
        )

        const cable = calculatePhysicsCable(fromFrame, fromSide, toFrame, toSide)
        const groupElem = document.querySelector(`[data-connection-id="${conn.id}"]`) as SVGGElement | null
        if (!groupElem) continue

        const shadowPath = groupElem.querySelector('.cable-shadow') as SVGPathElement | null
        const linePath = groupElem.querySelector('.cable-line') as SVGPathElement | null
        const startJack = groupElem.querySelector('.cable-jack-start') as SVGCircleElement | null
        const startJackCore = groupElem.querySelector('.cable-jack-start-core') as SVGCircleElement | null
        const endJack = groupElem.querySelector('.cable-jack-end') as SVGCircleElement | null
        const endJackCore = groupElem.querySelector('.cable-jack-end-core') as SVGCircleElement | null
        const disconnectGroup = groupElem.querySelector('.cable-disconnect') as SVGGElement | null

        if (shadowPath) shadowPath.setAttribute('d', cable.path)
        if (linePath) linePath.setAttribute('d', cable.path)
        if (startJack) {
          startJack.setAttribute('cx', String(cable.startPoint.x))
          startJack.setAttribute('cy', String(cable.startPoint.y))
        }
        if (startJackCore) {
          startJackCore.setAttribute('cx', String(cable.startPoint.x))
          startJackCore.setAttribute('cy', String(cable.startPoint.y))
        }
        if (endJack) {
          endJack.setAttribute('cx', String(cable.endPoint.x))
          endJack.setAttribute('cy', String(cable.endPoint.y))
        }
        if (endJackCore) {
          endJackCore.setAttribute('cx', String(cable.endPoint.x))
          endJackCore.setAttribute('cy', String(cable.endPoint.y))
        }
        if (disconnectGroup) {
          disconnectGroup.setAttribute('transform', `translate(${cable.midPoint.x}, ${cable.midPoint.y})`)
        }
      }
    },
    [workspace]
  )

  const beginNodeDrag = useCallback(
    (event: ReactPointerEvent, node: CanvasNode) => {
      event.stopPropagation()
      if (event.button !== 0 || node.locked) return

      const target = event.currentTarget as HTMLElement
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // Fallback se pointer capture não for suportado
      }

      setSelectedIds(new Set([node.id]))

      const cardElement = target.closest('.node') as HTMLElement | null
      const startX = event.clientX
      const startY = event.clientY
      const initialFrameX = node.frame.x
      const initialFrameY = node.frame.y
      let currentX = initialFrameX
      let currentY = initialFrameY

      const onPointerMove = (e: PointerEvent): void => {
        const dx = (e.clientX - startX) / viewport.zoom
        const dy = (e.clientY - startY) / viewport.zoom
        currentX = Math.round(initialFrameX + dx)
        currentY = Math.round(initialFrameY + dy)

        if (cardElement) {
          cardElement.style.left = `${currentX}px`
          cardElement.style.top = `${currentY}px`
        }
        updateAttachedCables(node.id, currentX, currentY)
      }

      const onPointerUp = (e: PointerEvent): void => {
        try {
          target.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
        target.removeEventListener('pointermove', onPointerMove)
        target.removeEventListener('pointerup', onPointerUp)
        target.removeEventListener('pointercancel', onPointerUp)

        updateNode(node.id, (current) => ({
          ...current,
          frame: { ...current.frame, x: currentX, y: currentY }
        }))
      }

      target.addEventListener('pointermove', onPointerMove)
      target.addEventListener('pointerup', onPointerUp)
      target.addEventListener('pointercancel', onPointerUp)
    },
    [setSelectedIds, updateAttachedCables, updateNode, viewport.zoom]
  )

  const beginResize = useCallback(
    (event: ReactPointerEvent, node: CanvasNode) => {
      event.preventDefault()
      event.stopPropagation()
      if (node.locked) return

      const target = event.currentTarget as HTMLElement
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // fallback
      }

      const cardElement = target.closest('.node') as HTMLElement | null
      const startX = event.clientX
      const startY = event.clientY
      const initialWidth = node.frame.width
      const initialHeight = node.frame.height
      let currentWidth = initialWidth
      let currentHeight = initialHeight

      const onPointerMove = (e: PointerEvent): void => {
        const dx = (e.clientX - startX) / viewport.zoom
        const dy = (e.clientY - startY) / viewport.zoom
        currentWidth = Math.max(NODE_MIN_WIDTH, Math.round(initialWidth + dx))
        currentHeight = Math.max(NODE_MIN_HEIGHT, Math.round(initialHeight + dy))

        if (cardElement) {
          cardElement.style.width = `${currentWidth}px`
          cardElement.style.height = `${currentHeight}px`
        }
        updateAttachedCables(node.id, node.frame.x, node.frame.y)
      }

      const onPointerUp = (e: PointerEvent): void => {
        try {
          target.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
        target.removeEventListener('pointermove', onPointerMove)
        target.removeEventListener('pointerup', onPointerUp)
        target.removeEventListener('pointercancel', onPointerUp)

        updateNode(node.id, (current) => ({
          ...current,
          frame: { ...current.frame, width: currentWidth, height: currentHeight }
        }))
      }

      target.addEventListener('pointermove', onPointerMove)
      target.addEventListener('pointerup', onPointerUp)
      target.addEventListener('pointercancel', onPointerUp)
    },
    [updateAttachedCables, updateNode, viewport.zoom]
  )

  const beginPan = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest('.node')))
        return
      const origin = { x: event.clientX, y: event.clientY, viewport }
      const move = (pointer: PointerEvent): void =>
        setViewport({
          ...origin.viewport,
          x: origin.viewport.x + pointer.clientX - origin.x,
          y: origin.viewport.y + pointer.clientY - origin.y
        })
      const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up, { once: true })
    },
    [setViewport, viewport]
  )

  const zoomCanvas = useCallback(
    (event: ReactWheelEvent<HTMLElement>) => {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, viewport.zoom * Math.exp(-event.deltaY * 0.0015))
      )
      const worldX = (pointerX - viewport.x) / viewport.zoom
      const worldY = (pointerY - viewport.y) / viewport.zoom
      setViewport({
        zoom: nextZoom,
        x: pointerX - worldX * nextZoom,
        y: pointerY - worldY * nextZoom
      })
    },
    [setViewport, viewport]
  )

  const createConnection = useCallback(
    (fromNodeId: string, fromSide?: PortSide, toNodeId?: string, toSide?: PortSide) => {
      if (!toNodeId || fromNodeId === toNodeId) return

      setWorkspace((current) => {
        if (!current) return current
        const exists = current.connections.some(
          (c) =>
            (c.fromNodeId === fromNodeId && c.toNodeId === toNodeId) ||
            (c.fromNodeId === toNodeId && c.toNodeId === fromNodeId)
        )
        if (exists) return current

        return {
          ...current,
          connections: [
            ...current.connections,
            {
              id: crypto.randomUUID(),
              fromNodeId,
              toNodeId,
              fromSide,
              toSide,
              color: '#0a84ff'
            }
          ]
        }
      })
    },
    [setWorkspace]
  )

  const removeConnection = useCallback(
    (connectionId: string) => {
      setWorkspace((current) =>
        current
          ? {
              ...current,
              connections: current.connections.filter((c) => c.id !== connectionId)
            }
          : current
      )
    },
    [setWorkspace]
  )

  const startCableDrag = useCallback(
    (nodeId: string, side: PortSide, event: ReactPointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.button !== 0) return

      const target = event.currentTarget as HTMLElement
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // fallback
      }

      const worldX = (event.clientX - viewport.x) / viewport.zoom
      const worldY = (event.clientY - viewport.y) / viewport.zoom

      setPendingConnection({
        fromNodeId: nodeId,
        fromSide: side,
        currentPosition: { x: worldX, y: worldY }
      })

      const onPointerMove = (e: PointerEvent): void => {
        const curX = (e.clientX - viewport.x) / viewport.zoom
        const curY = (e.clientY - viewport.y) / viewport.zoom
        setPendingConnection((prev) => (prev ? { ...prev, currentPosition: { x: curX, y: curY } } : null))
      }

      const onPointerUp = (e: PointerEvent): void => {
        try {
          target.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
        target.removeEventListener('pointermove', onPointerMove)
        target.removeEventListener('pointerup', onPointerUp)
        target.removeEventListener('pointercancel', onPointerUp)

        const elem = document.elementFromPoint(e.clientX, e.clientY)
        const portElem = elem?.closest('.cable-port') as HTMLElement | null
        const nodeElem = elem?.closest('.node') as HTMLElement | null

        if (portElem) {
          const targetNodeId = portElem.getAttribute('data-node-id')
          const targetSide = portElem.getAttribute('data-side') as PortSide | null
          if (targetNodeId && targetNodeId !== nodeId) {
            createConnection(nodeId, side, targetNodeId, targetSide ?? undefined)
          }
        } else if (nodeElem) {
          const targetNodeId = nodeElem.getAttribute('data-node-id')
          if (targetNodeId && targetNodeId !== nodeId) {
            createConnection(nodeId, side, targetNodeId, undefined)
          }
        }

        setPendingConnection(null)
      }

      target.addEventListener('pointermove', onPointerMove)
      target.addEventListener('pointerup', onPointerUp)
      target.addEventListener('pointercancel', onPointerUp)
    },
    [createConnection, viewport.x, viewport.y, viewport.zoom]
  )

  const handlePortClick = useCallback(
    (nodeId: string, side: PortSide) => {
      if (!pendingConnection) {
        setPendingConnection({ fromNodeId: nodeId, fromSide: side })
        return
      }

      if (pendingConnection.fromNodeId === nodeId && pendingConnection.fromSide === side) {
        setPendingConnection(null)
        return
      }

      if (pendingConnection.fromNodeId !== nodeId) {
        createConnection(pendingConnection.fromNodeId, pendingConnection.fromSide, nodeId, side)
      }

      setPendingConnection(null)
    },
    [createConnection, pendingConnection]
  )

  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPendingConnection(null)
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return
      if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault()
        setViewport({ x: 0, y: 0, zoom: 1 })
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key.toLowerCase() === 't') void createNode('terminal')
        if (event.key.toLowerCase() === 'n') void createNode('note')
        if (event.key.toLowerCase() === 'f') void createNode('fileTree')
        if (event.key.toLowerCase() === 'p') void createNode('portal')
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [createNode, setViewport])

  const connections = useMemo(() => {
    if (!workspace) return []
    const obstacles = workspace.nodes.map((node) => ({
      x: node.frame.x,
      y: node.frame.y,
      width: node.frame.width,
      height: node.minimized ? 39 : node.frame.height
    }))

    return workspace.connections.flatMap((connection) => {
      const from = workspace.nodes.find((node) => node.id === connection.fromNodeId)
      const to = workspace.nodes.find((node) => node.id === connection.toNodeId)
      if (!from || !to) return []

      const fromFrame = {
        x: from.frame.x,
        y: from.frame.y,
        width: from.frame.width,
        height: from.minimized ? 39 : from.frame.height
      }
      const toFrame = {
        x: to.frame.x,
        y: to.frame.y,
        width: to.frame.width,
        height: to.minimized ? 39 : to.frame.height
      }

      const nodeObstacles = obstacles.filter(
        (obs) =>
          !(obs.x === fromFrame.x && obs.y === fromFrame.y) &&
          !(obs.x === toFrame.x && obs.y === toFrame.y)
      )

      const { fromSide, toSide } = determineOptimalPorts(
        fromFrame,
        toFrame,
        connection.fromSide,
        connection.toSide
      )

      const cable = calculatePhysicsCable(fromFrame, fromSide, toFrame, toSide, nodeObstacles)

      return [
        {
          ...connection,
          ...cable
        }
      ]
    })
  }, [workspace])

  const draftCable = useMemo(() => {
    if (!pendingConnection?.currentPosition || !workspace) return null
    const fromNode = workspace.nodes.find((n) => n.id === pendingConnection.fromNodeId)
    if (!fromNode) return null

    const fromFrame = {
      x: fromNode.frame.x,
      y: fromNode.frame.y,
      width: fromNode.frame.width,
      height: fromNode.minimized ? 39 : fromNode.frame.height
    }

    return calculateDraftCable(
      fromFrame,
      pendingConnection.fromSide ?? 'bottom',
      pendingConnection.currentPosition
    )
  }, [pendingConnection, workspace])

  if (startupError) {
    return (
      <main className="startup-error">
        <div>
          <strong>Não foi possível iniciar o Maestri Open</strong>
          <p>{startupError}</p>
        </div>
      </main>
    )
  }

  return (
    <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <header className="titlebar">
        <strong>Maestri Open</strong>
        <span className="titlebar-workspace">{workspace?.name ?? 'Carregando'} · Térreo</span>
      </header>

      {sidebarOpen && (
        <aside className="sidebar">
          <div className="sidebar-search">
            <Search size={15} />
            <input
              aria-label="Filtrar"
              placeholder="Filtrar"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <button
              aria-label="Novo workspace"
              title="Novo workspace"
              onClick={() => void createNode('terminal')}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="sidebar-label">WORKSPACES</div>
          <button
            className="workspace-row active"
            onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
          >
            <FolderClosed size={15} className="workspace-folder" />
            <span className="workspace-name">{workspace?.name ?? 'Meu Workspace'}</span>
            <span className="workspace-count">
              <Command size={12} />
              {workspace?.nodes.filter((node) => node.type === 'terminal').length ?? 0}
            </span>
          </button>
          <div className="sidebar-node-list">
            {workspace?.nodes
              .filter((node) => node.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
              .map((node) => {
                const Icon = nodeIcon(node.type)
                return (
                  <button
                    key={node.id}
                    className="sidebar-node"
                    onClick={() => {
                      setSelectedIds(new Set([node.id]))
                      setViewport((current) => ({
                        ...current,
                        x: 110 - node.frame.x * current.zoom,
                        y: 120 - node.frame.y * current.zoom
                      }))
                    }}
                  >
                    <Icon size={13} />
                    <span>{node.title}</span>
                    <small>
                      {node.type === 'terminal'
                        ? stringData(node, 'shellName', 'Terminal')
                        : node.type === 'note'
                          ? 'Nota'
                          : node.type}
                    </small>
                  </button>
                )
              })}
          </div>
          <button className="new-group-btn" onClick={() => void createNode('terminal')}>
            <FolderPlus size={15} />
            <span>Novo grupo</span>
          </button>
          <div className="sidebar-bottom">
            <button className="settings" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={15} aria-label="Configurações" />
            </button>
            <button
              className="settings"
              title="Refinamento continuo"
              onClick={() =>
                setAgentPanelId(
                  workspace?.nodes.find((n) => selectedIds.has(n.id) && n.type === 'terminal')
                    ?.id ?? workspace?.nodes.find((n) => n.type === 'terminal')?.id
                )
              }
            >
              <span className="routine-glyph">◷</span>
            </button>
          </div>
        </aside>
      )}

      <main
        ref={canvasRef}
        className={`canvas ${sidebarOpen ? '' : 'canvas-expanded'} ${pendingConnection ? 'connecting' : ''}`}
        style={{
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          backgroundSize: `${12 * viewport.zoom}px ${12 * viewport.zoom}px`
        }}
        onPointerDown={(event) => {
          if (pendingConnection) {
            setPendingConnection(null)
            return
          }
          beginPan(event)
        }}
        onWheel={zoomCanvas}
        onDoubleClick={(event) => {
          if (event.target !== event.currentTarget) return
          const rect = event.currentTarget.getBoundingClientRect()
          void createNode('note', {
            x: (event.clientX - rect.left - viewport.x) / viewport.zoom,
            y: (event.clientY - rect.top - viewport.y) / viewport.zoom
          })
        }}
      >
        <button
          className="sidebar-toggle"
          title={sidebarOpen ? 'Fechar barra lateral' : 'Abrir barra lateral'}
          aria-label={sidebarOpen ? 'Fechar barra lateral' : 'Abrir barra lateral'}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setSidebarOpen((open) => !open)}
        >
          <span>{sidebarOpen ? '☰' : '☰'}</span>
        </button>
        <div className="toolbar" onPointerDown={(event) => event.stopPropagation()}>
          <button className="tool-select" title="Seleção" aria-label="Seleção">
            <MousePointer2 size={16} />
          </button>
          {tools.map(({ type, label, icon: Icon, shortcut }) => (
            <button
              key={type}
              title={`${label} (${shortcut})`}
              aria-label={label}
              onClick={() => void createNode(type)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
          <button title="Texto" aria-label="Texto" onClick={() => void createNode('text')}>
            <Type size={16} />
          </button>
          <button title="Desenhar" aria-label="Desenhar">
            <span className="draw-glyph">／</span>
          </button>
        </div>

        <div
          className="world"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`
          }}
        >
          <svg className="cables" aria-hidden="true">
            {connections.map((connection) => (
              <g
                key={connection.id}
                className="cable-group"
                data-connection-id={connection.id}
              >
                {/* Sombra difusa / profundidade física */}
                <path d={connection.path} className="cable-shadow" />

                {/* Cabo flexível com física de gravidade e fluxo animado */}
                <path
                  d={connection.path}
                  className="cable-line"
                  style={{ stroke: connection.color || '#0a84ff' }}
                />

                {/* Plug / Jack terminal de saída */}
                <circle
                  cx={connection.startPoint.x}
                  cy={connection.startPoint.y}
                  r={5}
                  className="cable-jack-outer cable-jack-start"
                />
                <circle
                  cx={connection.startPoint.x}
                  cy={connection.startPoint.y}
                  r={2.5}
                  fill={connection.color || '#0a84ff'}
                  className="cable-jack-start-core"
                />

                {/* Plug / Jack terminal de entrada */}
                <circle
                  cx={connection.endPoint.x}
                  cy={connection.endPoint.y}
                  r={5}
                  className="cable-jack-outer cable-jack-end"
                />
                <circle
                  cx={connection.endPoint.x}
                  cy={connection.endPoint.y}
                  r={2.5}
                  fill={connection.color || '#0a84ff'}
                  className="cable-jack-end-core"
                />

                {/* Botão de desconexão central (ao passar o mouse no cabo) */}
                <g
                  className="cable-disconnect"
                  transform={`translate(${connection.midPoint.x}, ${connection.midPoint.y})`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeConnection(connection.id)
                  }}
                >
                  <circle r={10} className="cable-disconnect-bg" />
                  <path
                    d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5"
                    className="cable-disconnect-icon"
                  />
                </g>
              </g>
            ))}

            {/* Cabo ao vivo sendo puxado pelo usuário (Draft Preview) */}
            {draftCable && (
              <g className="cable-group cable-draft">
                <path d={draftCable.path} className="cable-shadow" />
                <path d={draftCable.path} className="cable-line" style={{ stroke: '#0a84ff' }} />
                <circle
                  cx={draftCable.startPoint.x}
                  cy={draftCable.startPoint.y}
                  r={5}
                  className="cable-jack-outer"
                />
                <circle
                  cx={draftCable.startPoint.x}
                  cy={draftCable.startPoint.y}
                  r={2.5}
                  fill="#0a84ff"
                />
                <circle
                  cx={draftCable.endPoint.x}
                  cy={draftCable.endPoint.y}
                  r={4}
                  fill="#0a84ff"
                  opacity={0.8}
                />
              </g>
            )}
          </svg>

          {workspace?.nodes.map((node) => {
            const Icon = nodeIcon(node.type)
            const selected = selectedIds.has(node.id)
            const isPendingFromNode = pendingConnection?.fromNodeId === node.id

            return (
              <section
                key={node.id}
                data-node-id={node.id}
                className={`node ${selected ? 'selected' : ''} ${node.minimized ? 'minimized' : ''}`}
                style={{
                  left: node.frame.x,
                  top: node.frame.y,
                  width: node.frame.width,
                  height: node.minimized ? 39 : node.frame.height,
                  zIndex: node.zIndex
                }}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  if (pendingConnection && pendingConnection.fromNodeId !== node.id) {
                    createConnection(
                      pendingConnection.fromNodeId,
                      pendingConnection.fromSide,
                      node.id,
                      undefined
                    )
                    setPendingConnection(null)
                    return
                  }
                  setSelectedIds(new Set([node.id]))
                }}
              >
                {/* 4 Portas Magnéticas: Cima (top), Baixo (bottom), Esquerda (left), Direita (right) */}
                <button
                  className={`cable-port top ${isPendingFromNode && pendingConnection.fromSide === 'top' ? 'active' : ''}`}
                  title="Conectar porta superior (Cima) - Clique ou arraste"
                  data-node-id={node.id}
                  data-side="top"
                  onPointerDown={(event) => startCableDrag(node.id, 'top', event)}
                  onClick={(event) => {
                    event.stopPropagation()
                    handlePortClick(node.id, 'top')
                  }}
                />
                <button
                  className={`cable-port bottom ${isPendingFromNode && pendingConnection.fromSide === 'bottom' ? 'active' : ''}`}
                  title="Conectar porta inferior (Baixo) - Clique ou arraste"
                  data-node-id={node.id}
                  data-side="bottom"
                  onPointerDown={(event) => startCableDrag(node.id, 'bottom', event)}
                  onClick={(event) => {
                    event.stopPropagation()
                    handlePortClick(node.id, 'bottom')
                  }}
                />
                <button
                  className={`cable-port left ${isPendingFromNode && pendingConnection.fromSide === 'left' ? 'active' : ''}`}
                  title="Conectar porta esquerda - Clique ou arraste"
                  data-node-id={node.id}
                  data-side="left"
                  onPointerDown={(event) => startCableDrag(node.id, 'left', event)}
                  onClick={(event) => {
                    event.stopPropagation()
                    handlePortClick(node.id, 'left')
                  }}
                />
                <button
                  className={`cable-port right ${isPendingFromNode && pendingConnection.fromSide === 'right' ? 'active' : ''}`}
                  title="Conectar porta direita - Clique ou arraste"
                  data-node-id={node.id}
                  data-side="right"
                  onPointerDown={(event) => startCableDrag(node.id, 'right', event)}
                  onClick={(event) => {
                    event.stopPropagation()
                    handlePortClick(node.id, 'right')
                  }}
                />

                <div className="node-header" onPointerDown={(event) => beginNodeDrag(event, node)}>
                  <Icon size={14} />
                  <b className="node-title">{node.title}</b>
                  {node.type === 'terminal' && <span className="status active" />}

                  {/* Badge de Identidade / Role no cabeçalho exatamente como no Maestri original */}
                  {node.type === 'terminal' && (
                    <span
                      className="role-badge"
                      title={stringData(node, 'role') ? `Identidade: ${stringData(node, 'role')}` : 'Clique para configurar identidade'}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => setAgentPanelId(node.id)}
                    >
                      <span className="role-badge-icon">ℹ</span>
                      {stringData(node, 'role') ? stringData(node, 'role').slice(0, 16) : 'Atribuir Role'}
                    </span>
                  )}

                  <div className="node-actions">
                    {node.type === 'terminal' && (
                      <button
                        className="node-action"
                        title="Identidade e timer"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setAgentPanelId(node.id)}
                      >
                        <Settings2 size={13} />
                      </button>
                    )}
                    <button
                      className={`node-action ${pendingConnection?.fromNodeId === node.id ? 'active' : ''}`}
                      title="Conectar porta"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => handlePortClick(node.id, 'right')}
                    >
                      <Cable size={13} />
                    </button>
                    <button
                      className="node-action"
                      title={node.locked ? 'Destravar' : 'Travar'}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() =>
                        updateNode(node.id, (current) => ({ ...current, locked: !current.locked }))
                      }
                    >
                      {node.locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>
                    <button
                      className="node-action"
                      title={node.minimized ? 'Restaurar' : 'Minimizar'}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() =>
                        updateNode(node.id, (current) => ({
                          ...current,
                          minimized: !current.minimized
                        }))
                      }
                    >
                      {node.minimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
                    </button>
                    <button
                      className="node-action danger"
                      title="Remover"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => removeNode(node)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {!node.minimized && (
                  <div className="node-content">
                    {node.type === 'terminal' && (
                      <TerminalCard
                        terminalId={stringData(node, 'terminalId') || undefined}
                        shellName={stringData(node, 'shellName') || undefined}
                      />
                    )}
                    {(node.type === 'note' || node.type === 'text') && (
                      <textarea
                        className="note-editor"
                        value={stringData(node, 'content')}
                        spellCheck
                        onChange={(event) =>
                          updateNode(node.id, (current) => ({
                            ...current,
                            data: { ...current.data, content: event.target.value }
                          }))
                        }
                      />
                    )}
                    {node.type === 'fileTree' && (
                      <div className="placeholder-card">
                        <FolderTree size={28} />
                        <strong>{workspace.rootPath}</strong>
                        <span>O navegador de arquivos será ligado nesta pasta.</span>
                      </div>
                    )}
                    {node.type === 'portal' && (
                      <div className="portal-card">
                        <Globe2 size={36} />
                        <p>Inspecione uma aplicação local ou página web.</p>
                        <div className="portal-row">
                          <input
                            aria-label="URL do portal"
                            value={stringData(node, 'url', 'http://localhost:3000')}
                            onChange={(event) =>
                              updateNode(node.id, (current) => ({
                                ...current,
                                data: { ...current.data, url: event.target.value }
                              }))
                            }
                          />
                          <button
                            onClick={() =>
                              window.open(
                                stringData(node, 'url', 'http://localhost:3000'),
                                '_blank'
                              )
                            }
                          >
                            Abrir
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!node.minimized && !node.locked && (
                  <button
                    className="resize-handle"
                    title="Redimensionar"
                    onPointerDown={(event) => beginResize(event, node)}
                  />
                )}
              </section>
            )
          })}
        </div>

        <div className="canvas-controls" onPointerDown={(event) => event.stopPropagation()}>
          <button
            className="canvas-control-btn"
            title="Andares (Floors)"
            onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
          >
            <Layers size={17} />
          </button>
          <button className="canvas-control-btn" title="Minimapa">
            <Map size={17} />
          </button>
          <div className="zoom-pill">
            <button
              title="Diminuir zoom"
              aria-label="Diminuir zoom"
              onClick={() =>
                setViewport((current) => ({
                  ...current,
                  zoom: Math.max(MIN_ZOOM, current.zoom / 1.15)
                }))
              }
            >
              −
            </button>
            <span className="zoom-pill-value">{Math.round(viewport.zoom * 100)}%</span>
            <button
              title="Aumentar zoom"
              aria-label="Aumentar zoom"
              onClick={() =>
                setViewport((current) => ({
                  ...current,
                  zoom: Math.min(MAX_ZOOM, current.zoom * 1.15)
                }))
              }
            >
              +
            </button>
          </div>
        </div>
        {pendingConnection && (
          <div className="connection-tip">
            {pendingConnection.fromSide
              ? `Conectando da porta ${pendingConnection.fromSide} · Clique no destino ou Esc para cancelar`
              : 'Clique em uma porta de outro cartão · Esc para cancelar'}
          </div>
        )}
      </main>

      {workspace && agentPanelId && workspace.nodes.some((n) => n.id === agentPanelId) && (
        <AgentPanel
          key={agentPanelId}
          node={workspace.nodes.find((n) => n.id === agentPanelId)!}
          workspace={workspace}
          close={() => setAgentPanelId(undefined)}
          save={async (role) => {
            const next = {
              ...workspace,
              nodes: workspace.nodes.map((n) =>
                n.id === agentPanelId ? { ...n, data: { ...n.data, role } } : n
              )
            }
            await window.maestri.saveWorkspace(next)
            setWorkspace(next)
          }}
        />
      )}
      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <h2>Ajustes locais</h2>
              <button title="Fechar" onClick={() => setSettingsOpen(false)}>
                <X size={16} />
              </button>
            </header>
            <p>Shells detectados neste computador:</p>
            <div className="shell-list">
              {shells.length ? (
                shells.map((shell) => (
                  <div className="shell-row" key={shell.id}>
                    <span>{shell.name}</span>
                    <code>{shell.executable}</code>
                  </div>
                ))
              ) : (
                <span className="empty-shells">Nenhum shell compatível foi detectado.</span>
              )}
            </div>
            <small>
              Atalhos: T terminal, N nota, F arquivos, P portal, Ctrl+0 restaurar canvas.
            </small>
          </section>
        </div>
      )}
    </div>
  )
}
