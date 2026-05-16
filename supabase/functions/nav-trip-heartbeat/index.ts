// nav-trip-heartbeat
// Called every ~15s by the client during active navigation. Server-side
// authoritative gate for the "20 MNT per minute stuck in traffic" feature.
//
// Validates (any fail → reject + no credit):
//   1. Trip belongs to caller, still open, started < 6h ago.
//   2. Client timestamp within ±60s of server time.
//   3. Speed ≤ 10 km/h (~2.78 m/s) — above this user isn't "stuck".
//   4. Position within 75 m of the route polyline (anti-spoof).
//   5. Matched segment's Mapbox congestion ∈ {moderate, heavy, severe}.
//   6. If app_state='background', a rewarded-ad SSV must be < 60 min old.
//   7. User has moved ≥ 10 m from stationary anchor within 10 min (parked-car).
//   8. Daily cap (2,000 MNT in Asia/Ulaanbaatar TZ) not yet exhausted.
//
// On accept: increments trip.earned_seconds by the gap since last accepted
// heartbeat (clamped to 20s). For every full minute crossed, calls
// try_credit_traffic_minute RPC which atomically clamps to the daily cap and
// writes a wallet_ledger row idempotent on (trip_id, minute).
//
// Body: { tripId, lat, lon, speedMps, appState, clientTs, etaSeconds? }
// Returns: { accepted, rejectReason?, creditedThisHeartbeat, earnedMntTotal, dailyCapReached }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authUserId, jsonResponse } from '../_shared/auth.ts'
import { distanceToPolyline, haversineMeters, type LonLat } from '../_shared/geo.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_HEARTBEAT_GAP_S        = 20
const MAX_CLOCK_SKEW_MS          = 60_000
const MAX_TRIP_AGE_MS            = 6 * 60 * 60 * 1000
const SPEED_STUCK_THRESHOLD_MPS  = 2.78           // 10 km/h
const POLYLINE_MATCH_RADIUS_M    = 75
const STATIONARY_RADIUS_M        = 10
const STATIONARY_WINDOW_MS       = 10 * 60 * 1000
const BG_AD_VALIDITY_MS          = 60 * 60 * 1000
const EARNING_CONGESTION         = new Set(['moderate', 'heavy', 'severe'])

interface RouteSegment { start: number; end: number; congestion: string }
interface RouteSummary {
  coordinates: LonLat[]
  segments: RouteSegment[]
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const userId = await authUserId(req, SUPABASE_URL, SUPABASE_ANON_KEY)
    if (!userId) return jsonResponse({ error: 'unauthorized' }, 401)

    const { tripId, lat, lon, speedMps, appState, clientTs, etaSeconds } = await req.json()
    if (!tripId || typeof lat !== 'number' || typeof lon !== 'number' || !clientTs ||
        (appState !== 'foreground' && appState !== 'background')) {
      return jsonResponse({ error: 'invalid_body' }, 400)
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: trip, error: tripErr } = await db
      .from('nav_trips')
      .select('*')
      .eq('id', tripId)
      .eq('user_id', userId)
      .single()
    if (tripErr || !trip) return jsonResponse({ error: 'trip_not_found' }, 404)
    if (trip.ended_at)    return jsonResponse({ error: 'trip_ended' }, 409)

    const nowMs       = Date.now()
    const startedAtMs = new Date(trip.started_at).getTime()
    const clientMs    = new Date(clientTs).getTime()

    // Helper to record a heartbeat — always written even when rejected, for audit.
    const recordHeartbeat = async (accepted: boolean, reason: string | null, creditedSec: number) => {
      await db.from('nav_heartbeats').insert({
        trip_id:          tripId,
        client_ts:        new Date(clientMs).toISOString(),
        lat,
        lon,
        speed_mps:        typeof speedMps === 'number' ? speedMps : null,
        app_state:        appState,
        accepted,
        reject_reason:    reason,
        credited_seconds: creditedSec,
      })
    }

    const reject = async (reason: string) => {
      await recordHeartbeat(false, reason, 0)
      return jsonResponse({
        accepted: false,
        rejectReason: reason,
        creditedThisHeartbeat: 0,
        earnedMntTotal: trip.earned_mnt,
        dailyCapReached: false,
      })
    }

    if (nowMs - startedAtMs > MAX_TRIP_AGE_MS) {
      await db.from('nav_trips').update({
        ended_at: new Date().toISOString(),
        ended_reason: 'auto_timeout',
      }).eq('id', tripId)
      return reject('trip_too_old')
    }

    if (Math.abs(nowMs - clientMs) > MAX_CLOCK_SKEW_MS) return reject('clock_skew')

    // Trips on non-driving modes never earn but still write heartbeats so
    // eta_share_positions can update (sharing works for all modes).
    if (trip.mode !== 'driving') {
      await updateSharePosition(db, tripId, lat, lon, etaSeconds)
      await recordHeartbeat(true, null, 0)
      return jsonResponse({
        accepted: true,
        creditedThisHeartbeat: 0,
        earnedMntTotal: 0,
        dailyCapReached: false,
      })
    }

    if (appState === 'background') {
      const adAt = trip.bg_ad_watched_at ? new Date(trip.bg_ad_watched_at).getTime() : 0
      if (!adAt || nowMs - adAt > BG_AD_VALIDITY_MS) return reject('no_bg_ad')
    }

    // Stationary check — only after a 10 min grace period from anchor.
    const anchorAtMs = trip.stationary_anchor_at ? new Date(trip.stationary_anchor_at).getTime() : nowMs
    const anchor: LonLat = [Number(trip.stationary_anchor_lon ?? lon), Number(trip.stationary_anchor_lat ?? lat)]
    const distFromAnchor = haversineMeters([lon, lat], anchor)
    if (distFromAnchor > STATIONARY_RADIUS_M) {
      // Bump anchor forward.
      await db.from('nav_trips').update({
        stationary_anchor_at:  new Date(nowMs).toISOString(),
        stationary_anchor_lat: lat,
        stationary_anchor_lon: lon,
      }).eq('id', tripId)
    } else if (nowMs - anchorAtMs > STATIONARY_WINDOW_MS) {
      await db.from('nav_trips').update({
        ended_at:     new Date(nowMs).toISOString(),
        ended_reason: 'auto_stationary',
      }).eq('id', tripId)
      return reject('stationary_too_long')
    }

    if (typeof speedMps === 'number' && speedMps > SPEED_STUCK_THRESHOLD_MPS) {
      // Moving freely — write share position, record, but no credit.
      await updateSharePosition(db, tripId, lat, lon, etaSeconds)
      await recordHeartbeat(true, 'moving', 0)
      return jsonResponse({
        accepted: true,
        creditedThisHeartbeat: 0,
        earnedMntTotal: trip.earned_mnt,
        dailyCapReached: false,
      })
    }

    const summary = trip.mapbox_route_summary as RouteSummary
    if (!summary?.coordinates?.length) return reject('no_route')

    const { dist, segmentIndex } = distanceToPolyline([lon, lat], summary.coordinates)
    if (dist > POLYLINE_MATCH_RADIUS_M) return reject('off_route')

    const congestion = matchCongestion(summary, segmentIndex)
    if (!EARNING_CONGESTION.has(congestion)) {
      await updateSharePosition(db, tripId, lat, lon, etaSeconds)
      await recordHeartbeat(true, 'free_flow', 0)
      return jsonResponse({
        accepted: true,
        creditedThisHeartbeat: 0,
        earnedMntTotal: trip.earned_mnt,
        dailyCapReached: false,
      })
    }

    // All gates pass — compute credited seconds since last accepted heartbeat.
    const lastAcceptedMs = trip.last_accepted_at ? new Date(trip.last_accepted_at).getTime() : nowMs
    const gapS = Math.max(0, Math.min(MAX_HEARTBEAT_GAP_S, Math.floor((nowMs - lastAcceptedMs) / 1000)))

    const prevSeconds = Number(trip.earned_seconds ?? 0)
    const newSeconds  = prevSeconds + gapS
    const prevMinutes = Math.floor(prevSeconds / 60)
    const newMinutes  = Math.floor(newSeconds  / 60)

    let creditedThisHeartbeat = 0
    let dailyCapReached = false

    for (let m = prevMinutes + 1; m <= newMinutes; m++) {
      const { data: credited, error: rpcErr } = await db.rpc('try_credit_traffic_minute', {
        p_trip_id: tripId,
        p_minute:  m,
      })
      if (rpcErr) {
        console.error('try_credit_traffic_minute error', rpcErr)
        break
      }
      const c = Number(credited ?? 0)
      creditedThisHeartbeat += c
      if (c === 0) { dailyCapReached = true; break }
    }

    await db.from('nav_trips').update({
      earned_seconds:   newSeconds,
      last_accepted_at: new Date(nowMs).toISOString(),
      last_lat:         lat,
      last_lon:         lon,
    }).eq('id', tripId)

    await updateSharePosition(db, tripId, lat, lon, etaSeconds)
    await recordHeartbeat(true, null, gapS)

    // Re-read trip total for accurate response.
    const { data: refreshed } = await db
      .from('nav_trips')
      .select('earned_mnt')
      .eq('id', tripId)
      .single()

    return jsonResponse({
      accepted: true,
      creditedThisHeartbeat,
      earnedMntTotal: refreshed?.earned_mnt ?? trip.earned_mnt + creditedThisHeartbeat,
      dailyCapReached,
    })
  } catch (err) {
    console.error('nav-trip-heartbeat error', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})

function matchCongestion(summary: RouteSummary, segmentIndex: number): string {
  // segments[].start/end index into summary.coordinates and bound a sub-range.
  // Find the segment whose [start, end) contains segmentIndex; default 'unknown'.
  for (const s of summary.segments) {
    if (segmentIndex >= s.start && segmentIndex < s.end) return s.congestion ?? 'unknown'
  }
  return 'unknown'
}

async function updateSharePosition(
  db: ReturnType<typeof createClient>,
  tripId: string,
  lat: number,
  lon: number,
  etaSeconds: unknown,
) {
  const { data: share } = await db
    .from('eta_shares')
    .select('id')
    .eq('trip_id', tripId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!share) return
  await db.from('eta_share_positions').upsert({
    share_id:    share.id,
    lat,
    lon,
    eta_seconds: typeof etaSeconds === 'number' ? Math.round(etaSeconds) : null,
  })
}
