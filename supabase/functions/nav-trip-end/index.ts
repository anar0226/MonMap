// nav-trip-end
// Marks an open nav_trips row as ended. Idempotent: re-calling on an already
// ended trip is a no-op. The reason is supplied by the client (user_stopped,
// auto_arrived) — server-driven end states (auto_stationary, auto_timeout)
// are set by nav-trip-heartbeat.
//
// Body: { tripId, reason?: 'user_stopped' | 'auto_arrived' }
// Returns: { ended, earnedMnt, durationSeconds }

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

    const { tripId, reason } = await req.json()
    if (!tripId) return jsonResponse({ error: 'invalid_body' }, 400)

    const endedReason = reason === 'auto_arrived' ? 'auto_arrived' : 'user_stopped'

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: trip, error } = await db
      .from('nav_trips')
      .update({
        ended_at:     new Date().toISOString(),
        ended_reason: endedReason,
      })
      .eq('id', tripId)
      .eq('user_id', userId)
      .is('ended_at', null)
      .select('earned_mnt, earned_seconds, started_at')
      .maybeSingle()

    if (error) {
      console.error('nav-trip-end update error', error)
      return jsonResponse({ error: 'update_failed' }, 500)
    }

    // Trip not found / already ended — still return success for idempotency.
    if (!trip) {
      return jsonResponse({ ended: false })
    }

    const durationSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(trip.started_at).getTime()) / 1000),
    )

    // Revoke any active eta_share so the public page stops live-tracking.
    await db
      .from('eta_shares')
      .update({ revoked_at: new Date().toISOString() })
      .eq('trip_id', tripId)
      .is('revoked_at', null)

    return jsonResponse({
      ended: true,
      earnedMnt: trip.earned_mnt,
      durationSeconds,
    })
  } catch (err) {
    console.error('nav-trip-end error', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})
