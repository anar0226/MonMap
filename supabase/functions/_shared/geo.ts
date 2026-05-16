// Geo helpers shared across nav-trip edge functions.
// Pure functions — no Deno or Supabase deps.

export type LonLat = [number, number]

/** Haversine distance in metres. */
export function haversineMeters(a: LonLat, b: LonLat): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const [lon1, lat1] = a
  const [lon2, lat2] = b
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const lat1r = toRad(lat1)
  const lat2r = toRad(lat2)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1r) * Math.cos(lat2r) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * Distance from point p to the polyline (sequence of [lon,lat]).
 * Returns { dist, segmentIndex } where segmentIndex is the index of the
 * polyline segment (between coords[i] and coords[i+1]) closest to p.
 *
 * For very long polylines this is O(n) which is fine here — Mapbox driving
 * routes are typically ≤ a few thousand vertices.
 */
export function distanceToPolyline(
  p: LonLat,
  coords: LonLat[],
): { dist: number; segmentIndex: number } {
  if (coords.length === 0) return { dist: Infinity, segmentIndex: -1 }
  if (coords.length === 1) {
    return { dist: haversineMeters(p, coords[0]), segmentIndex: 0 }
  }
  let best = Infinity
  let bestIdx = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const d = pointToSegmentMeters(p, coords[i], coords[i + 1])
    if (d < best) {
      best = d
      bestIdx = i
    }
  }
  return { dist: best, segmentIndex: bestIdx }
}

/**
 * Distance from p to the segment a→b in metres. Uses a local equirectangular
 * approximation (accurate enough for ≤ a few km segments, which is far
 * larger than Mapbox annotation granularity).
 */
function pointToSegmentMeters(p: LonLat, a: LonLat, b: LonLat): number {
  const latRef = (a[1] + b[1]) / 2
  const k = Math.cos((latRef * Math.PI) / 180)
  const ax = a[0] * k, ay = a[1]
  const bx = b[0] * k, by = b[1]
  const px = p[0] * k, py = p[1]
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = 0
  if (len2 > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / len2
    t = Math.max(0, Math.min(1, t))
  }
  const sx = ax + t * dx
  const sy = ay + t * dy
  // Convert degrees back to metres: 1 deg latitude ≈ 111_320 m
  const dLat = (py - sy) * 111320
  const dLon = ((px - sx) / k) * 111320 * k
  return Math.sqrt(dLat * dLat + dLon * dLon)
}
