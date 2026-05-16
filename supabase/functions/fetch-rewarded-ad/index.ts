// fetch-rewarded-ad
// Returns the current active ad as a signed Supabase Storage URL plus an
// HMAC verification token. The client plays the video, then submits the token
// to record-bg-ad-view. Token encodes (userId, tripId, adId, issuedAt,
// durationSeconds) so the server can confirm identity, timing, and ad watched.
//
// Body: { tripId }
// Returns: { adId, videoUrl, durationSeconds, verificationToken, expiresAt }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authUserId, jsonResponse } from '../_shared/auth.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const HMAC_SECRET               = Deno.env.get('REWARDED_AD_HMAC_SECRET')!

// Signed URL is valid for the ad duration + 5 min buffer for playback start lag.
const SIGNED_URL_EXTRA_SECS = 5 * 60

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
  try {
    const userId = await authUserId(req, SUPABASE_URL, SUPABASE_ANON_KEY)
    if (!userId) return jsonResponse({ error: 'unauthorized' }, 401)

    const { tripId } = await req.json()
    if (!tripId) return jsonResponse({ error: 'invalid_body' }, 400)

    if (!HMAC_SECRET) {
      console.error('REWARDED_AD_HMAC_SECRET not set')
      return jsonResponse({ error: 'server_misconfigured' }, 500)
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Confirm the trip is open and belongs to this user.
    const { data: trip } = await db
      .from('nav_trips')
      .select('id')
      .eq('id', tripId)
      .eq('user_id', userId)
      .is('ended_at', null)
      .maybeSingle()
    if (!trip) return jsonResponse({ error: 'trip_not_found' }, 404)

    // Pick the lowest display_order active ad (round-robin can be added later).
    const { data: ad, error: adErr } = await db
      .from('ads')
      .select('id, storage_path, duration_seconds')
      .eq('active', true)
      .order('display_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (adErr || !ad) {
      return jsonResponse({ error: 'no_active_ad' }, 404)
    }

    const signedUrlTtl = ad.duration_seconds + SIGNED_URL_EXTRA_SECS
    const { data: signedData, error: signErr } = await db.storage
      .from('ads')
      .createSignedUrl(ad.storage_path, signedUrlTtl)

    if (signErr || !signedData?.signedUrl) {
      console.error('createSignedUrl error', signErr)
      return jsonResponse({ error: 'signed_url_failed' }, 500)
    }

    const issuedAt = Date.now()
    const token = await makeToken(HMAC_SECRET, {
      uid: userId,
      tripId,
      adId: ad.id,
      issuedAt,
      durationSeconds: ad.duration_seconds,
    })

    return jsonResponse({
      adId:              ad.id,
      videoUrl:          signedData.signedUrl,
      durationSeconds:   ad.duration_seconds,
      verificationToken: token,
      // Client can show "token expires in N min" in the UI.
      expiresAt: new Date(issuedAt + (ad.duration_seconds + 10 * 60) * 1000).toISOString(),
    })
  } catch (err) {
    console.error('fetch-rewarded-ad error', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})

// ---------------------------------------------------------------------------
// HMAC helpers (same logic mirrored in record-bg-ad-view for verification).
// Format: base64url(JSON payload) + '.' + base64url(HMAC-SHA256 signature)
// ---------------------------------------------------------------------------

interface TokenPayload {
  uid: string
  tripId: string
  adId: string
  issuedAt: number
  durationSeconds: number
}

async function makeToken(secret: string, payload: TokenPayload): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const sig  = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `${body}.${sigB64}`
}
