export interface Venue {
  id: string
  place_id: string | null
  name_mn: string
  name_en: string | null
  address_mn: string | null
  lat: number
  lng: number
  floor_count: number
  default_floor: number
  bbox: {
    sw: [number, number]  // [lat, lng]
    ne: [number, number]
  }
}

export interface Floor {
  id: string
  venue_id: string
  floor_number: number
  name_mn: string
  name_en: string | null
  plan_svg_url: string | null
  plan_width_m: number | null
  plan_height_m: number | null
  anchor_lat: number | null
  anchor_lng: number | null
  anchor_rotation_deg: number
}

export type IndoorNodeType =
  | 'path'
  | 'junction'
  | 'store'
  | 'elevator'
  | 'escalator'
  | 'stairs'
  | 'entrance'
  | 'restroom'
  | 'info'

export interface IndoorNode {
  id: string
  floor_id: string
  venue_id: string
  floor_number: number
  node_type: IndoorNodeType
  lat: number
  lng: number
  connects_to_node_id: string | null
  place_id: string | null
  label_mn: string | null
  label_en: string | null
  is_accessible: boolean
}

export interface IndoorEdge {
  id: string
  venue_id: string
  from_node_id: string
  to_node_id: string
  bidirectional: boolean
  distance_m: number
  is_accessible: boolean
}

export type IndoorManeuverType =
  | 'straight'
  | 'turn_left'
  | 'turn_right'
  | 'u_turn'
  | 'floor_transition_elevator'
  | 'floor_transition_escalator'
  | 'floor_transition_stairs'
  | 'arrive'

export interface IndoorNavStep {
  node: IndoorNode
  // Bearing (degrees, 0=north) to walk toward the NEXT node
  bearing: number
  // Distance in metres from this node to the next
  distance_m: number
  // Human-readable Mongolian instruction
  instruction_mn: string
  maneuver_type: IndoorManeuverType
}

// Full indoor graph for one venue (all floors), cached client-side
export interface VenueGraph {
  venue: Venue
  floors: Floor[]
  // Maps node id → node; includes all floors so floor-transition links resolve
  nodes: Map<string, IndoorNode>
  // Maps node id → list of reachable (neighbour node id, distance_m) pairs
  adjacency: Map<string, Array<{ nodeId: string; distanceM: number }>>
  fetchedAt: number  // Date.now() — used to invalidate after 24h
}
