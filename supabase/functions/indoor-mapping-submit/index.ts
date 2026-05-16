// indoor-mapping-submit
// Validates and bulk-inserts a mapper's nodes + edges for one floor session.
//
// Validation gates:
//   - Mapper must own the session and be active for the venue
//   - Minimum 10 nodes
//   - At least one 'entrance' node
//   - Adjacent nodes must not exceed MAX_EDGE_M metres apart
//   - All nodes must be reachable from the entrance (flood-fill connectivity)
//
// Body:
//   {
//     sessionId: string,
//     nodes: Array<{
//       tempId:    string,        // client-side id for edge references
//       nodeType:  string,
//       lat:       number,
//       lng:       number,
//       placeId?:  string,
//       labelMn?:  string,
//       labelEn?:  string,
//       connectsToTempId?: string, // floor-transition pair (same-floor side only)
//     }>,
//     edges: Array<{
//       fromTempId:    string,
//       toTempId:      string,
//       bidirectional: boolean,
//       distanceM:     number,
//       isAccessible:  boolean,
//     }>
//   }
//
// Returns: { ok: true, nodesInserted, edgesInserted }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authUserId, jsonResponse } from '../_shared/auth.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MIN_NODES   = 10
const MAX_EDGE_M  = 30   // edges longer than this are flagged as sloppy placement

type NodeInput = {
  tempId:             string
  nodeType:           string
  lat:                number
  lng:                number
  placeId?:           string | null
  labelMn?:           string | null
  labelEn?:           string | null
  connectsToTempId?:  string | null
}

type EdgeInput = {
  fromTempId:    string
  toTempId:      string
  bidirectional: boolean
  distanceM:     number
  isAccessible:  boolean
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function floodFill(startTempId: string, adjacency: Map<string, Set<string>>): Set<string> {
  const visited = new Set<string>()
  const queue = [startTempId]
  while (queue.length > 0) {
    const current = queue.pop()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor)
    }
  }
  return visited
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

    const userId = await authUserId(req, SUPABASE_URL, SUPABASE_ANON_KEY)
    if (!userId) return jsonResponse({ error: 'unauthorized' }, 401)

    const body = await req.json()
    const { sessionId, nodes, edges } = (body ?? {}) as {
      sessionId: string
      nodes: NodeInput[]
      edges: EdgeInput[]
    }

    if (!sessionId || !Array.isArray(nodes) || !Array.isArray(edges)) {
      return jsonResponse({ error: 'missing_fields' }, 400)
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Load session + mapper + venue + floor
    const { data: session, error: sessionErr } = await admin
      .from('mapping_sessions')
      .select('id, status, floor_number, venue_id, mapper_id, venue_mappers!inner(user_id)')
      .eq('id', sessionId)
      .single()

    if (sessionErr || !session) return jsonResponse({ error: 'session_not_found' }, 404)
    if ((session.venue_mappers as { user_id: string }).user_id !== userId) {
      return jsonResponse({ error: 'unauthorized' }, 403)
    }
    if (session.status !== 'in_progress') {
      return jsonResponse({ error: 'session_already_submitted' }, 409)
    }

    // ── Validation ───────────────────────────────────────────────────────────

    if (nodes.length < MIN_NODES) {
      return jsonResponse({ error: 'too_few_nodes', minimum: MIN_NODES }, 422)
    }

    const entranceNode = nodes.find(n => n.nodeType === 'entrance')
    if (!entranceNode) {
      return jsonResponse({ error: 'no_entrance_node' }, 422)
    }

    // Check edge lengths
    const nodeMap = new Map(nodes.map(n => [n.tempId, n]))
    for (const e of edges) {
      const a = nodeMap.get(e.fromTempId)
      const b = nodeMap.get(e.toTempId)
      if (!a || !b) return jsonResponse({ error: 'edge_references_unknown_node' }, 422)
      const dist = haversineM(a.lat, a.lng, b.lat, b.lng)
      if (dist > MAX_EDGE_M) {
        return jsonResponse({
          error: 'edge_too_long',
          fromTempId: e.fromTempId,
          toTempId:   e.toTempId,
          distanceM:  Math.round(dist),
          maxAllowed: MAX_EDGE_M,
        }, 422)
      }
    }

    // Connectivity check: all nodes reachable from the entrance
    const adjacency = new Map<string, Set<string>>()
    for (const n of nodes) adjacency.set(n.tempId, new Set())
    for (const e of edges) {
      adjacency.get(e.fromTempId)?.add(e.toTempId)
      if (e.bidirectional) adjacency.get(e.toTempId)?.add(e.fromTempId)
    }
    const reachable = floodFill(entranceNode.tempId, adjacency)
    const isolated = nodes.filter(n => !reachable.has(n.tempId)).map(n => n.tempId)
    if (isolated.length > 0) {
      return jsonResponse({ error: 'isolated_nodes', isolated }, 422)
    }

    // ── Load floor record ────────────────────────────────────────────────────
    const { data: floorRow, error: floorErr } = await admin
      .from('floors')
      .select('id, floor_number')
      .eq('venue_id', session.venue_id)
      .eq('floor_number', session.floor_number)
      .single()

    if (floorErr || !floorRow) {
      return jsonResponse({ error: 'floor_not_found' }, 404)
    }

    // ── Insert nodes ─────────────────────────────────────────────────────────
    const nodeRows = nodes.map(n => ({
      floor_id:     floorRow.id,
      venue_id:     session.venue_id,
      floor_number: session.floor_number,
      node_type:    n.nodeType,
      lat:          n.lat,
      lng:          n.lng,
      place_id:     n.placeId ?? null,
      label_mn:     n.labelMn ?? null,
      label_en:     n.labelEn ?? null,
      created_by:   userId,
    }))

    const { data: insertedNodes, error: nodeInsertErr } = await admin
      .from('indoor_nodes')
      .insert(nodeRows)
      .select('id')

    if (nodeInsertErr || !insertedNodes) {
      console.error('node insert error', nodeInsertErr)
      return jsonResponse({ error: 'db_error' }, 500)
    }

    // Build tempId → real UUID map
    const tempToReal = new Map<string, string>()
    nodes.forEach((n, i) => tempToReal.set(n.tempId, insertedNodes[i].id))

    // ── Insert edges ─────────────────────────────────────────────────────────
    const edgeRows = edges.map(e => ({
      venue_id:      session.venue_id,
      from_node_id:  tempToReal.get(e.fromTempId)!,
      to_node_id:    tempToReal.get(e.toTempId)!,
      bidirectional: e.bidirectional,
      distance_m:    e.distanceM,
      is_accessible: e.isAccessible,
      created_by:    userId,
    }))

    const { error: edgeInsertErr } = await admin.from('indoor_edges').insert(edgeRows)
    if (edgeInsertErr) {
      console.error('edge insert error', edgeInsertErr)
      return jsonResponse({ error: 'db_error' }, 500)
    }

    // ── Wire up floor-transition pairs (connects_to_node_id) ─────────────────
    for (const n of nodes) {
      if (n.connectsToTempId) {
        const fromId = tempToReal.get(n.tempId)
        const toId   = tempToReal.get(n.connectsToTempId)
        if (fromId && toId) {
          await admin
            .from('indoor_nodes')
            .update({ connects_to_node_id: toId })
            .eq('id', fromId)
        }
      }
    }

    // ── Mark session submitted ───────────────────────────────────────────────
    await admin
      .from('mapping_sessions')
      .update({
        status:      'submitted',
        ended_at:    new Date().toISOString(),
        nodes_added: nodes.length,
        edges_added: edges.length,
      })
      .eq('id', sessionId)

    // Update mapper aggregate counts
    await admin.rpc('indoor_mapper_increment', {
      p_mapper_id:      session.mapper_id,
      p_nodes_added:    nodes.length,
      p_edges_added:    edges.length,
    }).maybeSingle()

    return jsonResponse({ ok: true, nodesInserted: nodes.length, edgesInserted: edges.length })
  } catch (err) {
    console.error('indoor-mapping-submit error', err)
    return jsonResponse({ error: 'internal_error' }, 500)
  }
})
