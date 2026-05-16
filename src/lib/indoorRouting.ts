import type { VenueGraph, IndoorNode, IndoorNavStep, IndoorManeuverType } from '../types/indoor'

// ─── Haversine ────────────────────────────────────────────────────────────────
export function haversineM(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Bearing in degrees (0 = north, clockwise) from (lat1,lng1) toward (lat2,lng2)
export function bearingDeg(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const y = Math.sin(dLng) * Math.cos(lat2 * (Math.PI / 180))
  const x =
    Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
    Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// ─── Dijkstra ─────────────────────────────────────────────────────────────────
/**
 * Returns an ordered array of node IDs from fromNodeId to toNodeId,
 * or null if no path exists.
 */
export function dijkstra(
  graph: VenueGraph,
  fromNodeId: string,
  toNodeId: string,
): string[] | null {
  if (fromNodeId === toNodeId) return [fromNodeId]

  const dist   = new Map<string, number>()
  const prev   = new Map<string, string>()
  // Min-heap via sorted insert — adequate for <500 node graphs
  const queue: Array<{ nodeId: string; d: number }> = []

  for (const id of graph.nodes.keys()) dist.set(id, Infinity)
  dist.set(fromNodeId, 0)
  queue.push({ nodeId: fromNodeId, d: 0 })

  while (queue.length > 0) {
    queue.sort((a, b) => a.d - b.d)
    const { nodeId: u, d: uDist } = queue.shift()!

    if (u === toNodeId) break
    if (uDist > (dist.get(u) ?? Infinity)) continue

    for (const { nodeId: v, distanceM } of graph.adjacency.get(u) ?? []) {
      const alt = uDist + distanceM
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt)
        prev.set(v, u)
        queue.push({ nodeId: v, d: alt })
      }
    }
  }

  if (!prev.has(toNodeId) && fromNodeId !== toNodeId) return null

  // Reconstruct path
  const path: string[] = []
  let cur: string | undefined = toNodeId
  while (cur !== undefined) {
    path.unshift(cur)
    cur = prev.get(cur)
  }
  return path[0] === fromNodeId ? path : null
}

// ─── Step generation ──────────────────────────────────────────────────────────
const TURN_THRESHOLD_DEG = 30  // heading change > 30° is a "turn"

function classifyTurn(
  fromBearing: number,
  toBearing: number,
): IndoorManeuverType {
  let delta = ((toBearing - fromBearing) + 360) % 360
  if (delta > 180) delta -= 360   // -180..+180
  if (Math.abs(delta) <= TURN_THRESHOLD_DEG) return 'straight'
  if (delta > 0)  return 'turn_right'
  return 'turn_left'
}

function floorTransitionType(node: IndoorNode): IndoorManeuverType {
  if (node.node_type === 'elevator')  return 'floor_transition_elevator'
  if (node.node_type === 'escalator') return 'floor_transition_escalator'
  return 'floor_transition_stairs'
}

function instructionMn(step: Omit<IndoorNavStep, 'instruction_mn'>): string {
  const distStr = step.distance_m < 1000
    ? `${Math.round(step.distance_m)} метр`
    : `${(step.distance_m / 1000).toFixed(1)} км`

  switch (step.maneuver_type) {
    case 'straight':    return `Шууд ${distStr} алхана`
    case 'turn_left':   return `${distStr}-н дараа зүүн тийш эргэнэ`
    case 'turn_right':  return `${distStr}-н дараа баруун тийш эргэнэ`
    case 'u_turn':      return `Эргэж буцна`
    case 'floor_transition_elevator':  return `Лифтэнд суугаарай`
    case 'floor_transition_escalator': return `Эскалаторт гарна`
    case 'floor_transition_stairs':    return `Шатаар гарна`
    case 'arrive':      return step.node.label_mn
      ? `${step.node.label_mn} — Хүрэх газартаа хүрлээ`
      : 'Хүрэх газартаа хүрлээ'
    default:            return `Шууд алхана`
  }
}

/**
 * Converts a Dijkstra node-id path into navigation steps.
 * Each step is "stand at node[i], walk toward node[i+1]".
 */
export function buildNavSteps(
  nodeIds: string[],
  graph: VenueGraph,
): IndoorNavStep[] {
  if (nodeIds.length === 0) return []
  if (nodeIds.length === 1) {
    const node = graph.nodes.get(nodeIds[0])!
    const step: Omit<IndoorNavStep, 'instruction_mn'> = {
      node, bearing: 0, distance_m: 0, maneuver_type: 'arrive',
    }
    return [{ ...step, instruction_mn: instructionMn(step) }]
  }

  const steps: IndoorNavStep[] = []

  for (let i = 0; i < nodeIds.length - 1; i++) {
    const node     = graph.nodes.get(nodeIds[i])!
    const nextNode = graph.nodes.get(nodeIds[i + 1])!
    const bearing  = bearingDeg(node.lat, node.lng, nextNode.lat, nextNode.lng)
    const distanceM = haversineM(node.lat, node.lng, nextNode.lat, nextNode.lng)

    let maneuver_type: IndoorManeuverType
    if (node.node_type === 'elevator' || node.node_type === 'escalator' || node.node_type === 'stairs') {
      maneuver_type = floorTransitionType(node)
    } else if (i === 0) {
      maneuver_type = 'straight'
    } else {
      const prevNode = graph.nodes.get(nodeIds[i - 1])!
      const prevBearing = bearingDeg(prevNode.lat, prevNode.lng, node.lat, node.lng)
      maneuver_type = classifyTurn(prevBearing, bearing)
    }

    const partial: Omit<IndoorNavStep, 'instruction_mn'> = { node, bearing, distance_m: distanceM, maneuver_type }
    steps.push({ ...partial, instruction_mn: instructionMn(partial) })
  }

  // Final arrival step
  const lastNode = graph.nodes.get(nodeIds[nodeIds.length - 1])!
  const arrivalPartial: Omit<IndoorNavStep, 'instruction_mn'> = {
    node: lastNode, bearing: 0, distance_m: 0, maneuver_type: 'arrive',
  }
  steps.push({ ...arrivalPartial, instruction_mn: instructionMn(arrivalPartial) })

  return steps
}

// ─── Nearest node ─────────────────────────────────────────────────────────────
/**
 * Returns the nearest node on the given floor within maxDistM metres,
 * or null if none is close enough.
 */
export function nearestNode(
  graph: VenueGraph,
  lat: number,
  lng: number,
  floorNumber: number,
  maxDistM = 15,
): IndoorNode | null {
  let best: IndoorNode | null = null
  let bestDist = Infinity

  for (const node of graph.nodes.values()) {
    if (node.floor_number !== floorNumber) continue
    const d = haversineM(lat, lng, node.lat, node.lng)
    if (d < maxDistM && d < bestDist) {
      bestDist = d
      best = node
    }
  }

  return best
}
