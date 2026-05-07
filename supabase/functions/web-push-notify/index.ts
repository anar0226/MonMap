// Sends a Web Push notification to all portal browser subscriptions registered
// for the place that owns a given booking.
//
// Required Supabase secrets (set via `supabase secrets set`):
//   VAPID_PUBLIC_KEY   — base64url-encoded P-256 public key
//   VAPID_PRIVATE_KEY  — base64url-encoded P-256 private key (JWK "d" value)
//   PORTAL_URL         — deployed portal origin, e.g. https://portal.monmap.mn

// @ts-ignore — npm specifier; works in Supabase Edge Functions (Deno 1.30+)
import webpush from 'npm:web-push'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY          = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY         = Deno.env.get('VAPID_PRIVATE_KEY')!
const PORTAL_URL                = Deno.env.get('PORTAL_URL') ?? 'https://portal.monmap.mn'

webpush.setVapidDetails(
  'mailto:support@monmap.mn',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
)

Deno.serve(async (req) => {
  try {
    const { bookingId } = await req.json()
    if (!bookingId) return new Response('Missing bookingId', { status: 400 })

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch booking row
    const { data: booking, error: bErr } = await db
      .from('bookings')
      .select('id, place_id, guest_name, booked_date, time_slot, party_size, status')
      .eq('id', bookingId)
      .single()
    if (bErr || !booking) {
      console.error('booking not found:', bookingId, bErr)
      return new Response('Booking not found', { status: 404 })
    }

    // Fetch place name
    const { data: place } = await db
      .from('places')
      .select('name')
      .eq('place_id', booking.place_id)
      .single()
    const placeName = place?.name ?? 'Газар'

    // Fetch all push subscriptions registered for this place
    const { data: subs, error: sErr } = await db
      .from('portal_push_subscriptions')
      .select('endpoint, p256dh, auth_key')
      .eq('place_id', booking.place_id)
    if (sErr) console.error('fetch subs error:', sErr)
    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_subscriptions' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build notification payload — title depends on booking status.
    const isCancelled = booking.status === 'cancelled' || booking.status === 'canceled'
    const payload = JSON.stringify({
      title: isCancelled ? '❌ Захиалга цуцлагдлаа' : '🔔 Шинэ захиалгын хүсэлт',
      body: `${booking.guest_name} · ${booking.booked_date} ${booking.time_slot} · ${booking.party_size} хүн`,
      bookingId: String(booking.id),
      url: `${PORTAL_URL}/bookings.html?booking=${booking.id}`,
    })

    // Fire all subscriptions concurrently
    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          payload,
          { TTL: 3600 }, // 1-hour TTL — if browser is offline, delivery is retried for 1 h
        ),
      ),
    )

    // Prune subscriptions that the push service has permanently rejected (410 Gone).
    // This keeps the table clean and avoids wasting calls on dead endpoints.
    const staleEndpoints = results
      .map((r, i) => ({ r, sub: subs[i] }))
      .filter(({ r }) => r.status === 'rejected' && (r.reason as any)?.statusCode === 410)
      .map(({ sub }) => sub.endpoint)

    if (staleEndpoints.length) {
      const { error: delErr } = await db
        .from('portal_push_subscriptions')
        .delete()
        .in('endpoint', staleEndpoints)
      if (delErr) console.warn('pruning stale subs failed:', delErr)
      else console.log(`pruned ${staleEndpoints.length} stale subscription(s)`)
    }

    const sent   = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    console.log(`web-push-notify: booking=${bookingId} place=${booking.place_id} sent=${sent} failed=${failed}`)

    return new Response(JSON.stringify({ sent, failed }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('web-push-notify error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
