// indoor-mapping-approve
// Admin-only: approve or reject a mapping session.
// On approval, credits the mapper's wallet and publishes the floor if it isn't already.
//
// Body:
//   {
//     sessionId:     string,
//     action:        'approve' | 'reject',
//     rewardMnt?:    number,   // required when action = 'approve'
//     reviewerNotes?: string,
//   }
//
// Returns: { ok: true, action, rewardMnt? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authUserId, jsonResponse } from '../_shared/auth.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Hardcoded admin user IDs; alternatively, check a role claim in the JWT.
// To add admins without redeploying, store in a small `admins` table and
// replace this lookup with a DB query.
async function isAdmin(userId: string, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const { data } = await admin
    .from('admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

    const userId = await authUserId(req, SUPABASE_URL, SUPABASE_ANON_KEY)
    if (!userId) return jsonResponse({ error: 'unauthorized' }, 401)

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    if (!(await isAdmin(userId, admin))) {
      return jsonResponse({ error: 'forbidden' }, 403)
    }

    const body = await req.json()
    const { sessionId, action, rewardMnt, reviewerNotes } = (body ?? {}) as {
      sessionId:      string
      action:         'approve' | 'reject'
      rewardMnt?:     number
      reviewerNotes?: string
    }

    if (!sessionId || !['approve', 'reject'].includes(action)) {
      return jsonResponse({ error: 'missing_fields' }, 400)
    }

    if (action === 'approve' && (!rewardMnt || rewardMnt <= 0)) {
      return jsonResponse({ error: 'reward_mnt_required_for_approval' }, 400)
    }

    // Load session
    const { data: session, error: sessionErr } = await admin
      .from('mapping_sessions')
      .select('id, status, mapper_id, venue_id, floor_number, venue_mappers!inner(user_id)')
      .eq('id', sessionId)
      .single()

    if (sessionErr || !session) return jsonResponse({ error: 'session_not_found' }, 404)
    if (session.status !== 'submitted') {
      return jsonResponse({ error: 'session_not_reviewable', current: session.status }, 409)
    }

    const mapperUserId = (session.venue_mappers as { user_id: string }).user_id
    const now = new Date().toISOString()

    if (action === 'reject') {
      await admin
        .from('mapping_sessions')
        .update({
          status:         'rejected',
          reviewer_notes: reviewerNotes ?? null,
          reviewed_by:    userId,
          reviewed_at:    now,
        })
        .eq('id', sessionId)

      return jsonResponse({ ok: true, action: 'reject' })
    }

    // ── Approve ──────────────────────────────────────────────────────────────
    const reward = rewardMnt!

    // Credit the mapper's wallet (idempotent — session id is the ref_id)
    const { error: creditErr } = await admin.rpc('credit_wallet', {
      p_user_id:  mapperUserId,
      p_delta:    reward,
      p_kind:     'indoor_mapping',
      p_ref_id:   sessionId,
      p_metadata: { venue_id: session.venue_id, floor_number: session.floor_number },
    })

    if (creditErr) {
      console.error('credit_wallet error', creditErr)
      return jsonResponse({ error: 'wallet_credit_failed' }, 500)
    }

    // Update session
    await admin
      .from('mapping_sessions')
      .update({
        status:         'approved',
        reward_mnt:     reward,
        reviewer_notes: reviewerNotes ?? null,
        reviewed_by:    userId,
        reviewed_at:    now,
      })
      .eq('id', sessionId)

    // Update mapper totals
    await admin
      .from('venue_mappers')
      .update({
        total_mnt_earned: admin.rpc('coalesce_add', { a: 'total_mnt_earned', b: reward }),
        updated_at: now,
      })
      .eq('id', session.mapper_id)

    // Publish the floor so the app can serve it to users
    await admin
      .from('floors')
      .update({ is_published: true })
      .eq('venue_id', session.venue_id)
      .eq('floor_number', session.floor_number)

    return jsonResponse({ ok: true, action: 'approve', rewardMnt: reward })
  } catch (err) {
    console.error('indoor-mapping-approve error', err)
    return jsonResponse({ error: 'internal_error' }, 500)
  }
})
