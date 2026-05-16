// referral-claim
// Called from the mobile client right after a fresh sign-up if a referral
// token was captured (either from a deep link or clipboard). Wraps the
// redeem_referral SECURITY DEFINER RPC, which handles all validation +
// atomic credit of ₮500 to both inviter and invitee.
//
// Body: { token }
// Returns: { awarded: boolean, referralId?: string, reason?: string }

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

    const { token } = await req.json()
    if (!token || typeof token !== 'string' || token.length < 8 || token.length > 32) {
      return jsonResponse({ error: 'invalid_token' }, 400)
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: referralId, error } = await db.rpc('redeem_referral', {
      p_share_token: token,
      p_invitee_id:  userId,
    })

    if (error) {
      // RPC raises P0001 'invalid_token' / P0002 'unknown_token'.
      const code = (error as { code?: string }).code
      const msg  = String(error.message ?? '')
      if (code === 'P0001' || msg.includes('invalid_token')) {
        return jsonResponse({ awarded: false, reason: 'invalid_token' }, 400)
      }
      if (code === 'P0002' || msg.includes('unknown_token')) {
        return jsonResponse({ awarded: false, reason: 'unknown_token' }, 404)
      }
      console.error('redeem_referral rpc error', error)
      return jsonResponse({ error: 'rpc_failed' }, 500)
    }

    if (!referralId) {
      // Rejection path was taken inside the RPC; look up reason for telemetry.
      const { data: row } = await db
        .from('referrals')
        .select('reject_reason')
        .eq('invitee_user_id', userId)
        .maybeSingle()
      return jsonResponse({ awarded: false, reason: row?.reject_reason ?? 'rejected' })
    }

    return jsonResponse({ awarded: true, referralId })
  } catch (err) {
    console.error('referral-claim error', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})
