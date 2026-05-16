// nav-trip-start
// Creates a nav_trips row when the user begins turn-by-turn driving navigation.
// Client supplies the chosen Mapbox route (coordinates + per-segment congestion).
// We snapshot this so the heartbeat function can match positions back to it
// without the client being able to swap a more-congested route in mid-trip.
//
// Body:
//   {
//     origin:      [lon, lat],
//     destination: [lon, lat],
//     mode:        'driving' | 'transit' | 'walking' | 'cycling' | 'escooter',
//     route: {
//       coordinates: [[lon,lat], ...],        // ordered polyline vertices
//       segments:    [{ start, end, congestion }, ...],
//                                             // indices into coordinates[]
//       distanceMeters: number,
//       durationSeconds: number,
//       durationTypicalSeconds: number | null,
//     }
//   }
//
// Returns: { tripId, earningsEnabled }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authUserId, jsonResponse } from '../_shared/auth.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

    const userId = await authUserId(req, SUPABASE_URL, SUPABASE_ANON_KEY)
    if (!userId) return jsonResponse({ error: 'unauthorized' }, 401)

    const body = await req.json()
    const { origin, destination, mode, route } = body ?? {}

    if (
      !Array.isArray(origin) || origin.length !== 2 ||
      !Array.isArray(destination) || destination.length !== 2 ||
      !route?.coordinates?.length ||
      !Array.isArray(route?.segments)
    ) {
      return jsonResponse({ error: 'invalid_body' }, 400)
    }
    if (route.coordinates.length > 5000) {
      return jsonResponse({ error: 'route_too_long' }, 400)
    }

    const tripMode = typeof mode === 'string' ? mode : 'driving'
    const earningsEnabled = tripMode === 'driving'

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Close any stale open trip for this user — at most one open per user.
    await db
      .from('nav_trips')
      .update({ ended_at: new Date().toISOString(), ended_reason: 'auto_timeout' })
      .is('ended_at', null)
      .eq('user_id', userId)

    const summary = {
      coordinates:           route.coordinates,
      segments:              route.segments,
      distanceMeters:        Number(route.distanceMeters ?? 0),
      durationSeconds:       Number(route.durationSeconds ?? 0),
      durationTypicalSeconds: route.durationTypicalSeconds ?? null,
    }

    const { data: trip, error } = await db
      .from('nav_trips')
      .insert({
        user_id:                 userId,
        origin_lat:              origin[1],
        origin_lon:              origin[0],
        dest_lat:                destination[1],
        dest_lon:                destination[0],
        mode:                    tripMode,
        mapbox_route_summary:    summary,
        congestion_refreshed_at: new Date().toISOString(),
        stationary_anchor_at:    new Date().toISOString(),
        stationary_anchor_lat:   origin[1],
        stationary_anchor_lon:   origin[0],
      })
      .select('id')
      .single()

    if (error || !trip) {
      console.error('nav-trip-start insert failed', error)
      return jsonResponse({ error: 'insert_failed' }, 500)
    }

    return jsonResponse({ tripId: trip.id, earningsEnabled })
  } catch (err) {
    console.error('nav-trip-start error', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})
