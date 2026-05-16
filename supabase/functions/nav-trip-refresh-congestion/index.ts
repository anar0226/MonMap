// nav-trip-refresh-congestion
// Refreshes the per-segment Mapbox congestion stamp on an open trip. Called
// by the client every ~2 minutes so the heartbeat function keeps gating
// against current congestion (Mapbox annotations age out otherwise).
//
// The route geometry itself isn't replaced — only the segments[].congestion
// values are updated, so users can't swap to a more-congested route mid-trip.
//
// Body: { tripId, segments: [{start, end, congestion}, ...] }
// Returns: { ok, refreshedAt }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authUserId, jsonResponse } from '../_shared/auth.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
  try {
    const userId = await authUserId(req, SUPABASE_URL, SUPABASE_ANON_KEY)
    if (!userId) return jsonResponse({ error: 'unauthorized' }, 401)

    const { tripId, segments } = await req.json()
    if (!tripId || !Array.isArray(segments)) return jsonResponse({ error: 'invalid_body' }, 400)

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: trip } = await db
      .from('nav_trips')
      .select('mapbox_route_summary')
      .eq('id', tripId)
      .eq('user_id', userId)
      .is('ended_at', null)
      .maybeSingle()

    if (!trip) return jsonResponse({ error: 'trip_not_found' }, 404)

    const summary = trip.mapbox_route_summary as {
      coordinates: [number, number][]
      segments: { start: number; end: number; congestion: string }[]
    }

    // Only update segments whose start/end match the cached structure — this
    // ensures we never substitute geometry, only the congestion values.
    const byKey = new Map<string, string>()
    for (const s of segments as { start: number; end: number; congestion: string }[]) {
      byKey.set(`${s.start}:${s.end}`, s.congestion ?? 'unknown')
    }
    const updated = summary.segments.map(s => ({
      ...s,
      congestion: byKey.get(`${s.start}:${s.end}`) ?? s.congestion,
    }))

    const refreshedAt = new Date().toISOString()
    await db.from('nav_trips').update({
      mapbox_route_summary:    { ...summary, segments: updated },
      congestion_refreshed_at: refreshedAt,
    }).eq('id', tripId)

    return jsonResponse({ ok: true, refreshedAt })
  } catch (err) {
    console.error('nav-trip-refresh-congestion error', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})
