// eta-share-create
// Creates a short, opaque share token for an active nav_trips row. The token
// is what we hand out in the share URL (monmap.app/share/<token>). Public
// portal page polls eta-share-fetch with this token.
//
// Body: { tripId, durationMinutes?: number (default 120, max 480) }
// Returns: { token, url, expiresAt }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authUserId, jsonResponse } from '../_shared/auth.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PORTAL_BASE               = Deno.env.get('MONMAP_PORTAL_BASE') ?? 'https://monmap.app'

const BASE32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function randToken(len = 12): string {
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  let s = ''
  for (let i = 0; i < len; i++) s += BASE32[buf[i] % BASE32.length]
  return s
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
  try {
    const userId = await authUserId(req, SUPABASE_URL, SUPABASE_ANON_KEY)
    if (!userId) return jsonResponse({ error: 'unauthorized' }, 401)

    const { tripId, durationMinutes } = await req.json()
    if (!tripId) return jsonResponse({ error: 'invalid_body' }, 400)

    const mins = Math.min(480, Math.max(5, Number(durationMinutes) || 120))
    const expiresAt = new Date(Date.now() + mins * 60_000).toISOString()

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: trip } = await db
      .from('nav_trips')
      .select('id')
      .eq('id', tripId)
      .eq('user_id', userId)
      .is('ended_at', null)
      .maybeSingle()
    if (!trip) return jsonResponse({ error: 'trip_not_found' }, 404)

    // Revoke any prior active share on this trip (partial unique index allows only one).
    await db
      .from('eta_shares')
      .update({ revoked_at: new Date().toISOString() })
      .eq('trip_id', tripId)
      .is('revoked_at', null)

    // Retry up to 3 times on token collision (extremely unlikely).
    let token = ''
    for (let i = 0; i < 3; i++) {
      const candidate = randToken(12)
      const { data, error } = await db
        .from('eta_shares')
        .insert({
          share_token: candidate,
          user_id:     userId,
          trip_id:     tripId,
          expires_at:  expiresAt,
        })
        .select('share_token')
        .single()
      if (!error && data) { token = data.share_token; break }
      if (error && !String(error.message).includes('duplicate')) {
        console.error('eta-share-create insert', error)
        return jsonResponse({ error: 'insert_failed' }, 500)
      }
    }
    if (!token) return jsonResponse({ error: 'token_collision' }, 500)

    return jsonResponse({
      token,
      url: `${PORTAL_BASE}/share/${token}`,
      expiresAt,
    })
  } catch (err) {
    console.error('eta-share-create error', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})
