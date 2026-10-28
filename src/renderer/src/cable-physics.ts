import { PortSide } from '../../shared/contracts'

export type { PortSide }

export interface FrameRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PortAnchor {
  x: number
  y: number
  normal: { x: number; y: number }
  side: PortSide
}

export interface PhysicsCableResult {
  path: string
  startPoint: { x: number; y: number }
  endPoint: { x: number; y: number }
  midPoint: { x: number; y: number }
  fromSide: PortSide
  toSide: PortSide
}

const POINT_COUNT = 21
const OBSTACLE_PADDING = 18
const OBSTACLE_CORNER_ZONE = OBSTACLE_PADDING * 1.5
const OBSTACLE_BLEND = 0.45

/**
 * Retorna as coordenadas e vetor normal de uma porta específica de um card
 * (top = Cima, bottom = Baixo, left = Esquerda, right = Direita)
 */
export function getPortAnchor(frame: FrameRect, side: PortSide): PortAnchor {
  switch (side) {
    case 'top':
      return {
        x: frame.x + frame.width / 2,
        y: frame.y,
        normal: { x: 0, y: -1 },
        side: 'top'
      }
    case 'bottom':
      return {
        x: frame.x + frame.width / 2,
        y: frame.y + frame.height,
        normal: { x: 0, y: 1 },
        side: 'bottom'
      }
    case 'left':
      return {
        x: frame.x,
        y: frame.y + frame.height / 2,
        normal: { x: -1, y: 0 },
        side: 'left'
      }
    case 'right':
      return {
        x: frame.x + frame.width,
        y: frame.y + frame.height / 2,
        normal: { x: 1, y: 0 },
        side: 'right'
      }
  }
}

/**
 * Determina a melhor combinação de portas (cima, baixo, esquerda, direita)
 * entre dois nós baseado na posição espacial relativa de cada um.
 */
export function determineOptimalPorts(
  frameA: FrameRect,
  frameB: FrameRect,
  preferredFromSide?: PortSide,
  preferredToSide?: PortSide
): { fromSide: PortSide; toSide: PortSide } {
  if (preferredFromSide && preferredToSide) {
    return { fromSide: preferredFromSide, toSide: preferredToSide }
  }

  const centerA = { x: frameA.x + frameA.width / 2, y: frameA.y + frameA.height / 2 }
  const centerB = { x: frameB.x + frameB.width / 2, y: frameB.y + frameB.height / 2 }

  const dx = centerB.x - centerA.x
  const dy = centerB.y - centerA.y

  let fromSide: PortSide = preferredFromSide ?? 'right'
  let toSide: PortSide = preferredToSide ?? 'left'

  if (!preferredFromSide && !preferredToSide) {
    // Avalia se o vetor predominante é vertical (cima/baixo) ou horizontal
    // Damos prioridade à conexão vertical se a diferença Y for significativa
    if (Math.abs(dy) > Math.abs(dx) * 0.85) {
      if (dy > 0) {
        // B está abaixo de A -> sai de baixo (bottom) de A e entra em cima (top) de B
        fromSide = 'bottom'
        toSide = 'top'
      } else {
        // B está acima de A -> sai de cima (top) de A e entra em baixo (bottom) de B
        fromSide = 'top'
        toSide = 'bottom'
      }
    } else {
      if (dx > 0) {
        // B está à direita de A -> sai da direita (right) de A e entra na esquerda (left) de B
        fromSide = 'right'
        toSide = 'left'
      } else {
        // B está à esquerda de A -> sai da esquerda (left) de A e entra na direita (right) de B
        fromSide = 'left'
        toSide = 'right'
      }
    }
  } else if (preferredFromSide && !preferredToSide) {
    // Usuário escolheu a porta de origem, escolher a porta de destino mais compatível
    const anchorA = getPortAnchor(frameA, preferredFromSide)
    let bestDist = Infinity
    const candidates: PortSide[] = ['top', 'bottom', 'left', 'right']
    for (const side of candidates) {
      const anchorB = getPortAnchor(frameB, side)
      const dist = Math.hypot(anchorB.x - anchorA.x, anchorB.y - anchorA.y)
      if (dist < bestDist) {
        bestDist = dist
        toSide = side
      }
    }
  } else if (!preferredFromSide && preferredToSide) {
    const anchorB = getPortAnchor(frameB, preferredToSide)
    let bestDist = Infinity
    const candidates: PortSide[] = ['top', 'bottom', 'left', 'right']
    for (const side of candidates) {
      const anchorA = getPortAnchor(frameA, side)
      const dist = Math.hypot(anchorB.x - anchorA.x, anchorB.y - anchorA.y)
      if (dist < bestDist) {
        bestDist = dist
        fromSide = side
      }
    }
  }

  return { fromSide, toSide }
}

/**
 * Empurra pontos da física para fora de caixas de obstáculos (cards intermediários),
 * permitindo que os cabos contornem os cards graciosamente em vez de atravessá-los.
 */
function pushOutOfObstacles(point: { x: number; y: number }, obstacles: FrameRect[]): void {
  for (const rect of obstacles) {
    const minX = rect.x - OBSTACLE_PADDING
    const maxX = rect.x + rect.width + OBSTACLE_PADDING
    const minY = rect.y - OBSTACLE_PADDING
    const maxY = rect.y + rect.height + OBSTACLE_PADDING

    if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) continue

    const toLeft = point.x - minX
    const toRight = maxX - point.x
    const toTop = point.y - minY
    const toBottom = maxY - point.y

    const nearLeft = toLeft < OBSTACLE_CORNER_ZONE
    const nearRight = toRight < OBSTACLE_CORNER_ZONE
    const nearTop = toTop < OBSTACLE_CORNER_ZONE
    const nearBottom = toBottom < OBSTACLE_CORNER_ZONE

    let targetX = point.x
    let targetY = point.y

    if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
      const cornerX = nearLeft ? minX : maxX
      const cornerY = nearTop ? minY : maxY
      const dx = point.x - cornerX
      const dy = point.y - cornerY
      const dist = Math.hypot(dx, dy)
      if (dist > 1e-3) {
        targetX = cornerX + (dx / dist) * OBSTACLE_PADDING
        targetY = cornerY + (dy / dist) * OBSTACLE_PADDING
      }
    } else {
      const minDist = Math.min(toLeft, toRight, toTop, toBottom)
      if (minDist === toLeft) targetX = minX
      else if (minDist === toRight) targetX = maxX
      else if (minDist === toTop) targetY = minY
      else targetY = maxY
    }

    point.x += (targetX - point.x) * OBSTACLE_BLEND
    point.y += (targetY - point.y) * OBSTACLE_BLEND
  }
}

/**
 * Converte um conjunto de pontos físicos em uma curva contínua suave
 * (Spline C1 Catmull-Rom para Bézier Cúbica), extraído do motor de cordas do Maestri original.
 */
function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  const first = points[0]
  if (!first) return ''
  let path = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    const p0 = points[Math.max(i - 2, 0)]!
    const p1 = points[i - 1]!
    const p2 = points[i]!
    const p3 = points[Math.min(i + 1, points.length - 1)]!

    const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    path += ` C ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)}, ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return path
}

/**
 * Calcula a geometria física completa de um cabo entre dois nós:
 * - Gravidade catenária realista (queda natural no eixo Y dependendo do vão)
 * - Tangentes normais de saída nas portas (cima, baixo, esquerda, direita)
 * - Desvio de obstáculos (outros cards no canvas)
 * - Suavização por Spline Bézier
 */
export function calculatePhysicsCable(
  frameA: FrameRect,
  sideA: PortSide,
  frameB: FrameRect,
  sideB: PortSide,
  obstacles: FrameRect[] = []
): PhysicsCableResult {
  const pStart = getPortAnchor(frameA, sideA)
  const pEnd = getPortAnchor(frameB, sideB)

  const dist = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y)
  const tension = Math.min(220, Math.max(35, dist * 0.38))

  // Gravidade catenária: cabo cede para baixo com seu peso físico
  // Se a conexão for horizontal, a queda (sag) é mais pronunciada
  const isHorizontal = Math.abs(pEnd.x - pStart.x) > Math.abs(pEnd.y - pStart.y) * 0.6
  const baseSag = isHorizontal ? Math.max(25, Math.min(160, dist * 0.16)) : Math.max(10, Math.min(60, dist * 0.08))

  // Pontos de controle com tangentes normais
  const c1 = {
    x: pStart.x + pStart.normal.x * tension,
    y: pStart.y + pStart.normal.y * tension + (pStart.normal.y === 0 ? baseSag * 0.35 : 0)
  }
  const c2 = {
    x: pEnd.x + pEnd.normal.x * tension,
    y: pEnd.y + pEnd.normal.y * tension + (pEnd.normal.y === 0 ? baseSag * 0.35 : 0)
  }

  // Gera pontos interpolados com gravidade parabólica
  const points: { x: number; y: number }[] = []
  for (let i = 0; i < POINT_COUNT; i++) {
    const t = i / (POINT_COUNT - 1)
    const mt = 1 - t

    // Interpolação Bézier cúbica
    const x =
      mt * mt * mt * pStart.x +
      3 * mt * mt * t * c1.x +
      3 * mt * t * t * c2.x +
      t * t * t * pEnd.x
    let y =
      mt * mt * mt * pStart.y +
      3 * mt * mt * t * c1.y +
      3 * mt * t * t * c2.y +
      t * t * t * pEnd.y

    // Deformação da gravidade (sagging físico em forma de arco)
    const sag = baseSag * 4 * t * (1 - t)
    y += sag

    points.push({ x, y })
  }

  // Desvio de obstáculos (evita que o cabo atravesse cards no meio do caminho)
  if (obstacles.length > 0) {
    for (let i = 2; i < points.length - 2; i++) {
      pushOutOfObstacles(points[i]!, obstacles)
    }
  }

  const path = buildSmoothPath(points)
  const midIndex = Math.floor(points.length / 2)
  const midPoint = points[midIndex] ?? {
    x: (pStart.x + pEnd.x) / 2,
    y: (pStart.y + pEnd.y) / 2
  }

  return {
    path,
    startPoint: { x: pStart.x, y: pStart.y },
    endPoint: { x: pEnd.x, y: pEnd.y },
    midPoint,
    fromSide: sideA,
    toSide: sideB
  }
}

/**
 * Calcula a geometria física de um cabo sendo puxado em tempo real
 * (Draft Connection / Live preview).
 */
export function calculateDraftCable(
  frameA: FrameRect,
  sideA: PortSide,
  targetPoint: { x: number; y: number },
  targetNormal?: { x: number; y: number }
): { path: string; startPoint: { x: number; y: number }; endPoint: { x: number; y: number } } {
  const pStart = getPortAnchor(frameA, sideA)
  const dist = Math.hypot(targetPoint.x - pStart.x, targetPoint.y - pStart.y)
  const tension = Math.min(180, Math.max(30, dist * 0.35))
  const sag = Math.max(15, Math.min(110, dist * 0.14))

  const normalEnd = targetNormal ?? {
    x: (pStart.x - targetPoint.x) / (dist || 1),
    y: (pStart.y - targetPoint.y) / (dist || 1)
  }

  const c1 = {
    x: pStart.x + pStart.normal.x * tension,
    y: pStart.y + pStart.normal.y * tension + (pStart.normal.y === 0 ? sag * 0.3 : 0)
  }
  const c2 = {
    x: targetPoint.x + normalEnd.x * tension * 0.7,
    y: targetPoint.y + normalEnd.y * tension * 0.7
  }

  const points: { x: number; y: number }[] = []
  for (let i = 0; i < 15; i++) {
    const t = i / 14
    const mt = 1 - t
    const x =
      mt * mt * mt * pStart.x +
      3 * mt * mt * t * c1.x +
      3 * mt * t * t * c2.x +
      t * t * t * targetPoint.x
    let y =
      mt * mt * mt * pStart.y +
      3 * mt * mt * t * c1.y +
      3 * mt * t * t * c2.y +
      t * t * t * targetPoint.y
    y += sag * 4 * t * (1 - t)
    points.push({ x, y })
  }

  return {
    path: buildSmoothPath(points),
    startPoint: { x: pStart.x, y: pStart.y },
    endPoint: targetPoint
  }
}
