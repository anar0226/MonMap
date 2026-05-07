import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendSMS } from '../_shared/sms.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PORTAL_URL                = Deno.env.get('PORTAL_URL') ?? 'https://portal.monmap.mn'
const SUPPORT_PHONE             = '+976 9414-2121'

Deno.serve(async (req) => {
  try {
    // Require a user JWT — without this, an anonymous attacker who already
    // managed to insert a booking row could still trigger an SMS by replaying
    // notify-booking against any booking ID. Authenticate the caller, then
    // verify they own the booking they're asking us to notify on.
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!jwt) return new Response('Unauthorized', { status: 401 })

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response('Unauthorized', { status: 401 })
    }
    const callerId = userData.user.id

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

    // Enforce that the caller is the booking's owner. Service-role bypass
    // means RLS would not have caught this on its own.
    if (booking.user_id !== callerId) {
      return new Response('Forbidden', { status: 403 })
    }

    const { data: place } = await db
      .from('places')
      .select('name, phone_intl, phone_national')
      .eq('place_id', booking.place_id)
      .single()

    const businessPhone = place?.phone_intl ?? place?.phone_national
    const placeName = place?.name ?? 'Газар'

    const jobs: Promise<void>[] = []

    // Notify the business owner. Message content depends on booking status:
    // - pending   → new request, action required
    // - cancelled → customer cancelled, no action needed
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
      jobs.push(sendSMS(businessPhone, lines.join('\n')))
    }

    await Promise.allSettled(jobs)

    // Fire Web Push to any portal browser tabs the owner has subscribed.
    // Fire-and-forget — a push failure must never block the SMS or the response.
    fetch(`${SUPABASE_URL}/functions/v1/web-push-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ bookingId }),
    }).catch(e => console.warn('web-push-notify fire-and-forget failed:', e))

    return new Response(JSON.stringify({ ok: true }), {
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
