// eta-share-fetch
// Public, unauthenticated endpoint. The portal share page polls this every 5s
// to render the live position + ETA.
//
// Returns only the data needed for the public view:
//   - sharer first-name initial (privacy: no full name, no phone)
//   - last known position
//   - eta seconds
//   - route polyline (so the viewer can render the path)
//   - share status (active / expired / revoked / arrived)
//
// Query: ?token=...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/auth.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  // Always allow CORS for the portal.
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token || token.length < 8) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
      })
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: share } = await db
      .from('eta_shares')
      .select('id, trip_id, user_id, expires_at, revoked_at')
      .eq('share_token', token)
      .maybeSingle()

    if (!share) {
      return new Response(JSON.stringify({ status: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...cors },
      })
    }

    const now = Date.now()
    if (share.revoked_at) {
      return new Response(JSON.stringify({ status: 'revoked' }), {
        headers: { 'Content-Type': 'application/json', ...cors },
      })
    }
    if (new Date(share.expires_at).getTime() < now) {
      return new Response(JSON.stringify({ status: 'expired' }), {
        headers: { 'Content-Type': 'application/json', ...cors },
      })
    }

    const [{ data: trip }, { data: pos }, sharerUserRes] = await Promise.all([
      db.from('nav_trips')
        .select('dest_lat, dest_lon, mapbox_route_summary, ended_at')
        .eq('id', share.trip_id)
        .single(),
      db.from('eta_share_positions')
        .select('lat, lon, eta_seconds, updated_at')
        .eq('share_id', share.id)
        .maybeSingle(),
      db.auth.admin.getUserById(share.user_id),
    ])

    const rawName: string = sharerUserRes.data?.user?.user_metadata?.full_name ?? ''
    const sharerName = rawName.trim().split(/\s+/)[0] || 'A friend'
    const summary = trip?.mapbox_route_summary as { coordinates?: [number, number][] } | null

    return new Response(JSON.stringify({
      status: trip?.ended_at ? 'arrived' : 'active',
      sharerName,
      destination: trip ? { lat: trip.dest_lat, lon: trip.dest_lon } : null,
      position:    pos ? {
        lat: pos.lat, lon: pos.lon,
        etaSeconds: pos.eta_seconds,
        updatedAt:  pos.updated_at,
      } : null,
      route: summary?.coordinates ? { coordinates: summary.coordinates } : null,
      expiresAt: share.expires_at,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
    })
  } catch (err) {
    console.error('eta-share-fetch error', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } })
  }
})
