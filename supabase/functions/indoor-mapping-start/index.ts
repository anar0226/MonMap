// indoor-mapping-start
// Creates a mapping_sessions row when a mapper begins a floor-mapping session.
//
// Body: { venueId: string, floorNumber: number }
// Returns: { sessionId: string }

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
    const { venueId, floorNumber } = body ?? {}

    if (!venueId || floorNumber == null) {
      return jsonResponse({ error: 'missing_fields' }, 400)
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Verify the mapper is active for this venue
    const { data: mapper, error: mapperErr } = await admin
      .from('venue_mappers')
      .select('id')
      .eq('user_id', userId)
      .eq('venue_id', venueId)
      .eq('status', 'active')
      .single()

    if (mapperErr || !mapper) {
      return jsonResponse({ error: 'not_authorized_for_venue' }, 403)
    }

    // Close any in-progress session for this mapper+floor (idempotent re-start)
    await admin
      .from('mapping_sessions')
      .update({ status: 'submitted', ended_at: new Date().toISOString() })
      .eq('mapper_id', mapper.id)
      .eq('floor_number', floorNumber)
      .eq('status', 'in_progress')

    const { data: session, error: insertErr } = await admin
      .from('mapping_sessions')
      .insert({
        mapper_id:    mapper.id,
        venue_id:     venueId,
        floor_number: floorNumber,
        status:       'in_progress',
      })
      .select('id')
      .single()

    if (insertErr || !session) {
      console.error('insert session error', insertErr)
      return jsonResponse({ error: 'db_error' }, 500)
    }

    return jsonResponse({ sessionId: session.id })
  } catch (err) {
    console.error('indoor-mapping-start error', err)
    return jsonResponse({ error: 'internal_error' }, 500)
  }
})
