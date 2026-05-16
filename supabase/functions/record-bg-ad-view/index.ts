// record-bg-ad-view
// Stamps nav_trips.bg_ad_watched_at after verifying the client watched the
// full rewarded-ad video issued by fetch-rewarded-ad.
//
// Verification: the verificationToken from fetch-rewarded-ad is an HMAC-SHA256
// token binding (userId, tripId, adId, issuedAt, durationSeconds). We confirm:
//   1. Signature is valid (token wasn't forged).
//   2. Caller matches the uid in the token (can't reuse another user's token).
//   3. tripId matches the token (can't apply one trip's token to another).
//   4. now >= issuedAt + durationSeconds (watched the full video).
//   5. now < issuedAt + durationSeconds + 10 min (token not stale/stockpiled).
//
// Body: { tripId, verificationToken }
// Returns: { ok, validUntil }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authUserId, jsonResponse } from '../_shared/auth.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const HMAC_SECRET               = Deno.env.get('REWARDED_AD_HMAC_SECRET')!

// How long after (issuedAt + durationSeconds) a token is still valid.
const TOKEN_GRACE_MS = 10 * 60 * 1000

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
  try {
    const userId = await authUserId(req, SUPABASE_URL, SUPABASE_ANON_KEY)
    if (!userId) return jsonResponse({ error: 'unauthorized' }, 401)

    const { tripId, verificationToken } = await req.json()
    if (!tripId || !verificationToken || typeof verificationToken !== 'string') {
      return jsonResponse({ error: 'invalid_body' }, 400)
    }

    if (!HMAC_SECRET) {
      console.error('REWARDED_AD_HMAC_SECRET not set')
      return jsonResponse({ error: 'server_misconfigured' }, 500)
    }

    // --- Verify HMAC token ---
    const payload = await verifyToken(HMAC_SECRET, verificationToken)
    if (!payload) return jsonResponse({ error: 'invalid_token' }, 401)

    const nowMs = Date.now()

    if (payload.uid !== userId)   return jsonResponse({ error: 'token_user_mismatch' }, 401)
    if (payload.tripId !== tripId) return jsonResponse({ error: 'token_trip_mismatch' }, 401)

    const watchedAt    = payload.issuedAt + payload.durationSeconds * 1000
    const tokenExpiry  = watchedAt + TOKEN_GRACE_MS

    if (nowMs < watchedAt)   return jsonResponse({ error: 'ad_not_finished' }, 400)
    if (nowMs > tokenExpiry) return jsonResponse({ error: 'token_expired' }, 400)

    // --- Stamp the trip ---
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data, error } = await db
      .from('nav_trips')
      .update({ bg_ad_watched_at: new Date().toISOString() })
      .eq('id', tripId)
      .eq('user_id', userId)
      .is('ended_at', null)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('record-bg-ad-view update error', error)
      return jsonResponse({ error: 'update_failed' }, 500)
    }
    if (!data) return jsonResponse({ error: 'trip_not_found' }, 404)

    const validUntil = new Date(nowMs + 60 * 60 * 1000).toISOString()
    return jsonResponse({ ok: true, validUntil })
  } catch (err) {
    console.error('record-bg-ad-view error', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})

// ---------------------------------------------------------------------------
// HMAC verification (mirrors makeToken in fetch-rewarded-ad).
// ---------------------------------------------------------------------------

interface TokenPayload {
  uid: string
  tripId: string
  adId: string
  issuedAt: number
  durationSeconds: number
}

async function verifyToken(secret: string, token: string): Promise<TokenPayload | null> {
  try {
    const dot = token.lastIndexOf('.')
    if (dot < 1) return null
    const body   = token.slice(0, dot)
    const sigIn  = token.slice(dot + 1)

    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign'],
    )
    const expectedSigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(body))
    const expectedSig = btoa(String.fromCharCode(...new Uint8Array(expectedSigBuf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

    if (expectedSig !== sigIn) return null

    // Re-pad base64url before decoding.
    const padded = body.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((body.length + 3) % 4)
    return JSON.parse(atob(padded)) as TokenPayload
  } catch {
    return null
  }
}
