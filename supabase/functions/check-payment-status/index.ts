// Polled by the PaymentModal every 3 seconds to check payment state.
// Read-only — all writes happen in payment-webhook.
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  try {
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

    const { paymentId } = await req.json()
    if (!paymentId) return new Response('Missing paymentId', { status: 400 })

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch payment — enforce ownership to prevent enumeration
    const { data: payment, error: pErr } = await db
      .from('payments')
      .select('id, status, booking_id, hold_id')
      .eq('id', paymentId)
      .eq('user_id', callerId)
      .single()

    if (pErr || !payment) {
      return new Response('Not found', { status: 404 })
    }

    // Fetch the associated hold to get expiry time
    let holdExpiresAt: string | null = null
    let secondsRemaining = 0

    if (payment.hold_id) {
      const { data: hold } = await db
        .from('slot_holds')
        .select('expires_at')
        .eq('id', payment.hold_id)
        .single()

      if (hold) {
        holdExpiresAt = hold.expires_at
        secondsRemaining = Math.max(
          0,
          Math.floor((new Date(hold.expires_at).getTime() - Date.now()) / 1000),
        )
      }
    }

    // If the hold is gone and the payment is still pending, the hold expired
    const status =
      payment.status === 'pending' && !holdExpiresAt
        ? 'hold_expired'
        : payment.status

    return new Response(
      JSON.stringify({
        status,
        bookingId:        payment.booking_id ?? undefined,
        holdExpiresAt:    holdExpiresAt ?? undefined,
        secondsRemaining,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('check-payment-status error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
