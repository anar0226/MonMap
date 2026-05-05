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
      .select('name, phone_intl, phone_national')
      .eq('place_id', booking.place_id)
      .single()

    const businessPhone = place?.phone_intl ?? place?.phone_national
    const placeName = place?.name ?? 'Газар'

    const jobs: Promise<void>[] = []

    if (businessPhone) {
      const lines = [
        '🔔 MonMap: Шинэ захиалга!',
        `Нэр: ${booking.guest_name}`,
        `Огноо: ${booking.booked_date} ${booking.time_slot}`,
        `Хүн: ${booking.party_size}`,
      ]
      if (booking.guest_phone) lines.push(`Утас: ${booking.guest_phone}`)
      jobs.push(sendSMS(businessPhone, lines.join('\n')))
    }

    if (booking.guest_phone) {
      const msg = `MonMap: ${placeName}-д ${booking.booked_date} ${booking.time_slot} цагт таны захиалга баталгаажлаа. Сайхан хооллоорой! 🍽️`
      jobs.push(sendSMS(booking.guest_phone, msg))
    }

    await Promise.allSettled(jobs)

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
