import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM = Deno.env.get('TWILIO_FROM_NUMBER')!

async function sendSMS(to: string, body: string): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }).toString(),
  })
  if (!res.ok) {
    const txt = await res.text()
    console.error(`Twilio error sending to ${to}:`, txt)
  }
}

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ to: token, title, body, data, sound: 'default' }),
  })
  if (!res.ok) {
    const txt = await res.text()
    console.error('Expo push error:', txt)
  }
}

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

    const { data: place } = await db
      .from('places')
      .select('name')
      .eq('place_id', booking.place_id)
      .single()

    const placeName = place?.name ?? 'Газар'
    const jobs: Promise<void>[] = []

    // Push notification to the guest's device (if they were logged in when booking).
    if (booking.user_id) {
      const { data: tokenRow } = await db
        .from('user_push_tokens')
        .select('token')
        .eq('user_id', booking.user_id)
        .maybeSingle()

      if (tokenRow?.token) {
        jobs.push(
          sendExpoPush(
            tokenRow.token,
            'Захиалга баталгаажлаа! ✅',
            `${placeName} · ${booking.booked_date} ${booking.time_slot} цагт ${booking.party_size} хүн`,
            { bookingId: String(bookingId) },
          ),
        )
      }
    }

    // SMS to guest phone number.
    if (booking.guest_phone) {
      const msg = [
        `✅ MonMap: ${placeName}-д таны захиалга баталгаажлаа!`,
        `${booking.booked_date} ${booking.time_slot} цагт ${booking.party_size} хүн`,
        'Сайхан хооллоорой! 🍽️',
      ].join('\n')
      jobs.push(sendSMS(booking.guest_phone, msg))
    }

    await Promise.allSettled(jobs)

    return new Response(JSON.stringify({ ok: true }), {
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
