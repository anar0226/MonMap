import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendSMS } from '../_shared/sms.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PORTAL_URL                = Deno.env.get('PORTAL_URL') ?? 'https://portal.monmap.mn'
// Support phone is configurable so we never need a code deploy to change it.
// The default matches the launch-day support line; override in production via
// `supabase secrets set SUPPORT_PHONE='+976 ...'` if it ever changes.
const SUPPORT_PHONE             = Deno.env.get('SUPPORT_PHONE') ?? '+976 9414-2121'

// Best-effort audit log. Never let a logging failure cascade to the caller —
// the SMS itself is the durable side-effect; this row is observability.
async function logAttempt(
  db: ReturnType<typeof createClient>,
  bookingId: number | string,
  channel: 'sms_owner' | 'sms_guest' | 'push_guest',
  status: 'ok' | 'error',
  errorText: string | null,
): Promise<void> {
  try {
    await db.from('notification_attempts').insert({
      booking_id: bookingId,
      channel,
      status,
      error_text: errorText,
    })
  } catch (e) {
    console.error('notification_attempts insert failed:', e)
  }
}

Deno.serve(async (req) => {
  try {
    // Accept both user JWTs and service-role calls.
    // Service-role callers (payment-webhook, cancel-booking, expire-bookings) skip
    // the ownership check — they are internal and already authoritative.
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!jwt) return new Response('Unauthorized', { status: 401 })

    const isServiceRole = jwt === SUPABASE_SERVICE_ROLE_KEY
    let callerId: string | null = null

    if (!isServiceRole) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      })
      const { data: userData, error: userErr } = await userClient.auth.getUser()
      if (userErr || !userData?.user) {
        return new Response('Unauthorized', { status: 401 })
      }
      callerId = userData.user.id
    }

    const { bookingId } = await req.json()
    if (!bookingId) return new Response('Missing bookingId', { status: 400 })

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: booking, error: bErr } = await db
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (bErr || !booking) {
      console.error('Booking not found:', bookingId, bErr)
      return new Response('Booking not found', { status: 404 })
    }

    // For user-initiated calls, enforce ownership.
    // Service-role callers (internal edge functions) bypass this check.
    if (!isServiceRole && booking.user_id !== callerId) {
      return new Response('Forbidden', { status: 403 })
    }

    const { data: place } = await db
      .from('places')
      .select('name, phone_intl, phone_national')
      .eq('place_id', booking.place_id)
      .single()

    const businessPhone = place?.phone_intl ?? place?.phone_national
    const placeName = place?.name ?? 'Газар'

    // Notify the business owner. Message content depends on booking status:
    // - pending   → new request, action required
    // - cancelled → customer cancelled, no action needed
    let anyDelivered = false
    if (businessPhone) {
      const isCancelled = booking.status === 'cancelled' || booking.status === 'canceled'
      const lines = isCancelled
        ? [
            '❌ MonMap: Захиалга цуцлагдлаа',
            `Нэр: ${booking.guest_name}`,
            `Огноо: ${booking.booked_date} ${booking.time_slot}`,
            `Хүн: ${booking.party_size}`,
            ...(booking.guest_phone ? [`Утас: ${booking.guest_phone}`] : []),
            `Тусламж: ${SUPPORT_PHONE}`,
          ]
        : [
            '🔔 MonMap: Шинэ захиалгын хүсэлт!',
            `Нэр: ${booking.guest_name}`,
            `Огноо: ${booking.booked_date} ${booking.time_slot}`,
            `Хүн: ${booking.party_size}`,
            ...(booking.guest_phone ? [`Утас: ${booking.guest_phone}`] : []),
            `Батлах/цуцлах: ${PORTAL_URL}/bookings.html`,
            `Тусламж: ${SUPPORT_PHONE}`,
          ]
      const ownerSms = await sendSMS(businessPhone, lines.join('\n'))
        .then(() => ({ ok: true, err: null as string | null }))
        .catch((e) => ({ ok: false, err: String(e?.message ?? e) }))
      anyDelivered = anyDelivered || ownerSms.ok
      await logAttempt(db, bookingId, 'sms_owner', ownerSms.ok ? 'ok' : 'error', ownerSms.err)
    }

    // Fire Web Push to any portal browser tabs the owner has subscribed.
    // Fire-and-forget — a push failure must never block the SMS or the response.
    // We don't include this in the delivery-confirmation set above because the
    // request returns before we know whether any tab actually received it; the
    // SMS path is the durable channel.
    fetch(`${SUPABASE_URL}/functions/v1/web-push-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ bookingId }),
    }).catch(e => console.warn('web-push-notify fire-and-forget failed:', e))

    // Stamp owner_notified_at only if at least one channel acknowledged.
    // Leaving it NULL on total failure is what lets a future retry path
    // (cron or page-load reinvoke) find this row and try again.
    if (anyDelivered) {
      await db.from('bookings')
        .update({ owner_notified_at: new Date().toISOString() })
        .eq('id', bookingId)
    }

    return new Response(JSON.stringify({ ok: true, delivered: anyDelivered }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-booking error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
