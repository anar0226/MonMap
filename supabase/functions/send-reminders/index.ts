import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM = Deno.env.get('TWILIO_FROM_NUMBER')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

// Mongolia Standard Time is UTC+8, no DST.
// Combine a 'YYYY-MM-DD' date and 'HH:MM' time slot into a UTC Date.
function toUTC(dateStr: string, timeSlot: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [h, min] = timeSlot.split(':').map(Number)
  // Subtract 8 hours to convert MNT → UTC
  return new Date(Date.UTC(y, m - 1, d, h - 8, min))
}

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
  if (!res.ok) console.error(`Twilio error:`, await res.text())
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Fetch all unreminded, non-cancelled upcoming bookings
  const { data: bookings, error } = await db
    .from('bookings')
    .select('id, place_id, booked_date, time_slot, guest_name, guest_phone, party_size')
    .eq('reminder_sent', false)
    .neq('status', 'cancelled')

  if (error) {
    console.error('Failed to fetch bookings:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!bookings?.length) {
    return new Response(JSON.stringify({ reminded: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Keep only bookings that are 60–90 minutes from now
  const now = Date.now()
  const toRemind = bookings.filter((b) => {
    const dt = toUTC(b.booked_date, b.time_slot).getTime()
    const diff = dt - now
    return diff >= 60 * 60 * 1000 && diff < 90 * 60 * 1000
  })

  if (!toRemind.length) {
    return new Response(JSON.stringify({ reminded: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const placeIds = [...new Set(toRemind.map((b) => b.place_id))]
  const { data: places } = await db
    .from('places')
    .select('place_id, name, phone_intl, phone_national')
    .in('place_id', placeIds)

  const placeMap = new Map((places ?? []).map((p) => [p.place_id, p]))

  const smsJobs = toRemind.flatMap((b) => {
    const place = placeMap.get(b.place_id)
    const phone = place?.phone_intl ?? place?.phone_national
    if (!phone) return []
    const lines = [
      `⏰ MonMap: 1 цагийн дараа захиалга!`,
      `Нэр: ${b.guest_name}`,
      `${b.time_slot} · ${b.party_size} хүн`,
    ]
    if (b.guest_phone) lines.push(`Утас: ${b.guest_phone}`)
    return [sendSMS(phone, lines.join('\n'))]
  })

  await Promise.allSettled(smsJobs)

  const remindedIds = toRemind.map((b) => b.id)
  await db.from('bookings').update({ reminder_sent: true }).in('id', remindedIds)

  return new Response(JSON.stringify({ reminded: remindedIds.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
