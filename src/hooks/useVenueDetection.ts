import { useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import type { Venue, VenueGraph, IndoorNode, IndoorEdge, Floor } from '../types/indoor'

// Cached venue list is valid for 1 hour; graph is valid for 24 hours
const VENUE_LIST_TTL_MS  = 60 * 60 * 1000
const VENUE_GRAPH_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_KEY_VENUES   = 'indoor:venues:v1'
const graphCacheKey = (venueId: string) => `indoor:graph:${venueId}:v1`

// ─── Venue list cache ─────────────────────────────────────────────────────────
let venueListCache: { venues: Venue[]; fetchedAt: number } | null = null

async function fetchVenues(): Promise<Venue[]> {
  if (venueListCache && Date.now() - venueListCache.fetchedAt < VENUE_LIST_TTL_MS) {
    return venueListCache.venues
  }

  // Try AsyncStorage
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY_VENUES)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Date.now() - parsed.fetchedAt < VENUE_LIST_TTL_MS) {
        venueListCache = parsed
        return parsed.venues
      }
    }
  } catch { /* ignore cache read errors */ }

  const { data, error } = await supabase
    .from('venues')
    .select('id, place_id, name_mn, name_en, address_mn, lat, lng, floor_count, default_floor, bbox_sw_lat, bbox_sw_lng, bbox_ne_lat, bbox_ne_lng')
    .eq('is_active', true)

  if (error || !data) return []

  const venues: Venue[] = data.map((r) => ({
    id:            r.id,
    place_id:      r.place_id,
    name_mn:       r.name_mn,
    name_en:       r.name_en,
    address_mn:    r.address_mn,
    lat:           Number(r.lat),
    lng:           Number(r.lng),
    floor_count:   r.floor_count,
    default_floor: r.default_floor,
    bbox: {
      sw: [Number(r.bbox_sw_lat), Number(r.bbox_sw_lng)],
      ne: [Number(r.bbox_ne_lat), Number(r.bbox_ne_lng)],
    },
  }))

  venueListCache = { venues, fetchedAt: Date.now() }
  AsyncStorage.setItem(CACHE_KEY_VENUES, JSON.stringify(venueListCache)).catch(() => {})
  return venues
}

// ─── Graph cache ──────────────────────────────────────────────────────────────
const graphMemCache = new Map<string, VenueGraph>()

export async function fetchVenueGraph(venue: Venue): Promise<VenueGraph | null> {
  const mem = graphMemCache.get(venue.id)
  if (mem && Date.now() - mem.fetchedAt < VENUE_GRAPH_TTL_MS) return mem

  const cacheKey = graphCacheKey(venue.id)
  try {
    const raw = await AsyncStorage.getItem(cacheKey)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Date.now() - parsed.fetchedAt < VENUE_GRAPH_TTL_MS) {
        const graph = hydrateGraph(venue, parsed)
        graphMemCache.set(venue.id, graph)
        return graph
      }
    }
  } catch { /* ignore */ }

  // Fetch from Supabase
  const [floorsRes, nodesRes, edgesRes] = await Promise.all([
    supabase.from('floors').select('*').eq('venue_id', venue.id).eq('is_published', true),
    supabase.from('indoor_nodes').select('*').eq('venue_id', venue.id),
    supabase.from('indoor_edges').select('*').eq('venue_id', venue.id),
  ])

  if (nodesRes.error || edgesRes.error) return null

  const serializable = {
    floors:    floorsRes.data ?? [],
    nodes:     nodesRes.data  ?? [],
    edges:     edgesRes.data  ?? [],
    fetchedAt: Date.now(),
  }

  AsyncStorage.setItem(cacheKey, JSON.stringify(serializable)).catch(() => {})

  const graph = hydrateGraph(venue, serializable)
  graphMemCache.set(venue.id, graph)
  return graph
}

function hydrateGraph(
  venue: Venue,
  data: { floors: Floor[]; nodes: IndoorNode[]; edges: IndoorEdge[]; fetchedAt: number },
): VenueGraph {
  const nodes     = new Map<string, IndoorNode>()
  const adjacency = new Map<string, Array<{ nodeId: string; distanceM: number }>>()

  for (const n of data.nodes) {
    nodes.set(n.id, n)
    adjacency.set(n.id, [])
  }

  for (const e of data.edges) {
    adjacency.get(e.from_node_id)?.push({ nodeId: e.to_node_id, distanceM: e.distance_m })
    if (e.bidirectional) {
      adjacency.get(e.to_node_id)?.push({ nodeId: e.from_node_id, distanceM: e.distance_m })
    }
  }

  return { venue, floors: data.floors, nodes, adjacency, fetchedAt: data.fetchedAt }
}

// ─── Point-in-bbox ────────────────────────────────────────────────────────────
function isInsideBbox(lat: number, lng: number, venue: Venue): boolean {
  const { sw, ne } = venue.bbox
  return lat >= sw[0] && lat <= ne[0] && lng >= sw[1] && lng <= ne[1]
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
interface VenueDetectionResult {
  venue:    Venue | null
  graph:    VenueGraph | null
  isIndoor: boolean
}

export function useVenueDetection(
  userLocation: [number, number] | null,
): VenueDetectionResult {
  const [result, setResult] = useState<VenueDetectionResult>({
    venue: null, graph: null, isIndoor: false,
  })
  const venuesRef   = useRef<Venue[]>([])
  const loadedRef   = useRef(false)
  const lastVenueId = useRef<string | null>(null)

  // Load venue list once
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    fetchVenues().then(v => { venuesRef.current = v })
  }, [])

  useEffect(() => {
    if (!userLocation) return
    const [lat, lng] = userLocation

    const matched = venuesRef.current.find(v => isInsideBbox(lat, lng, v)) ?? null

    if (matched?.id === lastVenueId.current) return  // same venue, no change
    lastVenueId.current = matched?.id ?? null

    if (!matched) {
      setResult({ venue: null, graph: null, isIndoor: false })
      return
    }

    // Start graph download in background; update state once ready
    setResult({ venue: matched, graph: null, isIndoor: true })
    fetchVenueGraph(matched).then(graph => {
      setResult({ venue: matched, graph, isIndoor: true })
    })
  }, [userLocation])

  return result
}
