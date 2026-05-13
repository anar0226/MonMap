// Notifies the guest about a booking outcome.  Reads the booking's current
// status and branches into one of three messages:
//
//   confirmed → "✅ Your reservation is confirmed"      (sent by portal on accept)
//   cancelled → "❌ The venue declined your reservation" (sent by portal on decline)
//   expired   → "⏰ Couldn't reach the venue"            (sent by expire-bookings cron)
//
// Each branch fires both an Expo push (if user_id + push token exist) and an
// SMS to the guest's phone.  Failures are best-effort — never block the caller.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendSMS } from '../_shared/sms.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Support phone is configurable so we never need a code deploy to change it.
// The default matches the launch-day support line; override in production via
// `supabase secrets set SUPPORT_PHONE='+976 ...'` if it ever changes.
const SUPPORT_PHONE             = Deno.env.get('SUPPORT_PHONE') ?? '+976 9414-2121'

// Best-effort audit log. Never let a logging failure cascade to the caller —
// the SMS/push itself is the durable side-effect; this row is observability.
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

// ── Per-status message templates ──────────────────────────────────────────────

interface NotifyTemplate {
  pushTitle: string
  pushBody:  (placeName: string, date: string, time: string, partySize: number) => string
  smsBody:   (placeName: string, date: string, time: string, partySize: number) => string
}

const TEMPLATES: Record<string, NotifyTemplate> = {
  confirmed: {
    pushTitle: 'Захиалга баталгаажлаа! ✅',
    pushBody: (name, date, time, n) =>
      `${name} · ${date} ${time} цагт ${n} хүн`,
    smsBody: (name, date, time, n) => [
      `✅ MonMap: ${name}-д таны захиалга баталгаажлаа!`,
      `${date} ${time} цагт ${n} хүн`,
      'Сайхан хооллоорой! 🍽️',
    ].join('\n'),
  },
  cancelled: {
    pushTitle: 'Захиалга татгалзагдлаа ❌',
    pushBody: (name) =>
      `${name} газар таны захиалгыг хүлээж авч чадсангүй.`,
    smsBody: (name, date, time) => [
      `❌ MonMap: Уучлаарай, ${name} газар таны захиалгыг (${date} ${time}) хүлээж авсангүй.`,
      `Өөр газар сонгох эсвэл тусламж: ${SUPPORT_PHONE}`,
    ].join('\n'),
  },
  expired: {
    pushTitle: 'Захиалгад хариу ирсэнгүй ⏰',
    pushBody: (name) =>
      `${name} газартай 30 минутын дотор холбогдож чадсангүй.`,
    smsBody: (name, date, time) => [
      `⏰ MonMap: ${name} газартай 30 минутын дотор холбогдож чадсангүй (${date} ${time}).`,
      `Шууд утсаар холбогдох эсвэл өөр газар сонгох. Тусламж: ${SUPPORT_PHONE}`,
    ].join('\n'),
  },
}

// ── Push helper ───────────────────────────────────────────────────────────────

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: token, title, body, data, sound: 'default' }),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error('Expo push error:', text)
    throw new Error(`expo ${res.status}: ${text}`)
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
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

    // Pick the template by status — silently no-op for any status we don't
    // notify on (e.g. 'pending' would mean the cron hasn't fired yet).
    const tpl = TEMPLATES[booking.status]
    if (!tpl) {
      console.log(`notify-guest: no template for status='${booking.status}', skipping`)
      return new Response(JSON.stringify({ ok: true, skipped: booking.status }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: place } = await db
      .from('places')
      .select('name')
      .eq('place_id', booking.place_id)
      .single()
    const placeName = place?.name ?? 'Газар'

    let anyDelivered = false

    // Push to the guest's mobile device, if logged in and a token is on file.
    if (booking.user_id) {
      const { data: tokenRow } = await db
        .from('user_push_tokens')
        .select('token')
        .eq('user_id', booking.user_id)
        .maybeSingle()

      if (tokenRow?.token) {
        const push = await sendExpoPush(
          tokenRow.token,
          tpl.pushTitle,
          tpl.pushBody(placeName, booking.booked_date, booking.time_slot, booking.party_size),
          { bookingId: String(bookingId), status: booking.status },
        )
          .then(() => ({ ok: true, err: null as string | null }))
          .catch((e) => ({ ok: false, err: String(e?.message ?? e) }))
        anyDelivered = anyDelivered || push.ok
        await logAttempt(db, bookingId, 'push_guest', push.ok ? 'ok' : 'error', push.err)
      }
    }

    // SMS to the phone the guest typed at booking time (if any).
    if (booking.guest_phone) {
      const sms = await sendSMS(
        booking.guest_phone,
        tpl.smsBody(placeName, booking.booked_date, booking.time_slot, booking.party_size),
      )
        .then(() => ({ ok: true, err: null as string | null }))
        .catch((e) => ({ ok: false, err: String(e?.message ?? e) }))
      anyDelivered = anyDelivered || sms.ok
      await logAttempt(db, bookingId, 'sms_guest', sms.ok ? 'ok' : 'error', sms.err)
    }

    // Stamp guest_notified_at only when at least one channel acknowledged.
    // The portal queries for confirmed/cancelled bookings with NULL here on
    // page load and re-invokes us — see js/utils.js retryStuckGuestNotify().
    if (anyDelivered) {
      await db.from('bookings')
        .update({ guest_notified_at: new Date().toISOString() })
        .eq('id', bookingId)
    }

    return new Response(JSON.stringify({ ok: true, status: booking.status, delivered: anyDelivered }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-guest error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
