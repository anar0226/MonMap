// Expires bookings that have been pending for more than 30 minutes and
// notifies the guest via the existing notify-guest function (which now
// branches on status).
//
// Triggered every 5 minutes by pg_cron — see migration
// 20260509000003_booking_expiration.sql for the schedule SQL.
//
// Required secrets:
//   CRON_SECRET                — shared secret with pg_cron (rejects external calls)
//   SUPABASE_URL               — auto-populated by Supabase
//   SUPABASE_SERVICE_ROLE_KEY  — auto-populated by Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET               = Deno.env.get('CRON_SECRET') ?? ''

// Bookings older than this with status='pending' get auto-expired.
const EXPIRY_MINUTES = 30

Deno.serve(async (req) => {
  // Auth — only pg_cron should call this.
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Find all pending bookings older than EXPIRY_MINUTES.
  // We deliberately do NOT use updated_at because it doesn't exist on the
  // bookings table; created_at is what we have.
  const cutoff = new Date(Date.now() - EXPIRY_MINUTES * 60 * 1000).toISOString()

  const { data: stale, error: fetchErr } = await db
    .from('bookings')
    .select('id')
    .eq('status', 'pending')
    .lt('created_at', cutoff)

  if (fetchErr) {
    console.error('expire-bookings: fetch failed:', fetchErr)
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!stale?.length) {
    return new Response(JSON.stringify({ expired: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Flip status atomically. We re-check status='pending' in the WHERE clause
  // so a race with a late owner-confirmation doesn't clobber a confirmed
  // booking.  The .select() returns only the rows we actually changed.
  const ids = stale.map(b => b.id)
  const { data: expired, error: updErr } = await db
    .from('bookings')
    .update({ status: 'expired', expired_at: new Date().toISOString() })
    .in('id', ids)
    .eq('status', 'pending')
    .select('id')

  if (updErr) {
    console.error('expire-bookings: update failed:', updErr)
    return new Response(JSON.stringify({ error: updErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Fire notify-guest for each expired booking.  Fire-and-forget — a failure
  // here must not block the response or roll back the status update.
  const expiredIds = (expired ?? []).map(b => b.id)
  for (const id of expiredIds) {
    fetch(`${SUPABASE_URL}/functions/v1/notify-guest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ bookingId: id }),
    }).catch(e => console.warn(`notify-guest fire-and-forget failed for ${id}:`, e))
  }

  console.log(`expire-bookings: expired ${expiredIds.length} booking(s)`)

  return new Response(JSON.stringify({ expired: expiredIds.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
