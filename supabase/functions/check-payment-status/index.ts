// Polled by the PaymentModal every 3 seconds to check payment state.
//
// Primary source of truth is the local payments table (updated by payment-webhook).
// As a fallback, if the local status is still 'pending' and we have a qpay_invoice_id,
// we actively ask QPay whether the invoice was paid. This guards against webhook
// delivery delays / network failures that would otherwise leave the user stuck
// on the QR screen indefinitely after they've already paid.
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   QPAY_CLIENT_ID, QPAY_CLIENT_SECRET (used by _shared/qpay.ts)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkQPayInvoice } from '../_shared/qpay.ts'

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
      .select('id, status, booking_id, hold_id, qpay_invoice_id, user_id, place_id, amount')
      .eq('id', paymentId)
      .eq('user_id', callerId)
      .single()

    if (pErr || !payment) {
      return new Response('Not found', { status: 404 })
    }

    // Fetch the associated hold to get expiry time
    let hold: {
      id: string
      expires_at: string
      booked_date: string
      time_slot: string
      party_size: number
      guest_name: string
      guest_phone: string | null
      service: string | null
      duration_minutes: number | null
    } | null = null
    let holdExpiresAt: string | null = null
    let secondsRemaining = 0

    if (payment.hold_id) {
      const { data: holdData } = await db
        .from('slot_holds')
        .select('id, expires_at, booked_date, time_slot, party_size, guest_name, guest_phone, service, duration_minutes')
        .eq('id', payment.hold_id)
        .single()

      if (holdData) {
        hold = holdData as typeof hold
        holdExpiresAt = holdData.expires_at
        secondsRemaining = Math.max(
          0,
          Math.floor((new Date(holdData.expires_at).getTime() - Date.now()) / 1000),
        )
      }
    }

    let currentStatus: string = payment.status
    let bookingId: number | string | null | undefined = payment.booking_id

    // Fallback: if still pending and we have a QPay invoice + a live hold, ask QPay directly.
    // If QPay says PAID, run the same confirmation RPC the webhook uses so the user
    // doesn't have to wait for the (possibly delayed) webhook delivery.
    if (currentStatus === 'pending' && payment.qpay_invoice_id && hold && new Date(hold.expires_at) > new Date()) {
      try {
        const qpayResult = await checkQPayInvoice(payment.qpay_invoice_id)
        console.log(`check-payment-status fallback: payment=${payment.id} invoice=${payment.qpay_invoice_id} qpay_status=${qpayResult.status}`)
        if (qpayResult.status === 'PAID') {
          const { data: newBookingId, error: rpcErr } = await db.rpc('confirm_paid_booking', {
            p_payment_id:      payment.id,
            p_hold_id:         hold.id,
            p_user_id:         payment.user_id,
            p_place_id:        payment.place_id,
            p_booked_date:     hold.booked_date,
            p_time_slot:       hold.time_slot,
            p_party_size:      hold.party_size,
            p_guest_name:      hold.guest_name,
            p_guest_phone:     hold.guest_phone ?? null,
            p_service:         hold.service ?? null,
            p_duration_mins:   hold.duration_minutes ?? null,
            p_deposit_amount:  payment.amount,
            p_webhook_payload: { source: 'check-payment-status-fallback', qpay: qpayResult },
            p_qpay_payment_id: qpayResult.paymentId ?? null,
          })

          if (!rpcErr) {
            currentStatus = 'paid'
            bookingId = newBookingId

            // Fire notify-booking — same as the webhook does
            fetch(`${SUPABASE_URL}/functions/v1/notify-booking`, {
              method: 'POST',
              headers: {
                'Content-Type':  'application/json',
                'apikey':        SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({ bookingId: newBookingId }),
            }).catch(e => console.warn('notify-booking fire-and-forget failed:', e))
          } else if (rpcErr.message?.toLowerCase().includes('already')) {
            // Race with the webhook — re-read the row
            const { data: refreshed } = await db
              .from('payments')
              .select('status, booking_id')
              .eq('id', payment.id)
              .single()
            if (refreshed) {
              currentStatus = refreshed.status
              bookingId = refreshed.booking_id
            }
          } else {
            console.warn('check-payment-status fallback confirm failed:', rpcErr)
          }
        }
      } catch (qpayErr) {
        // QPay being unreachable shouldn't break polling — just fall through with current DB state.
        console.warn('check-payment-status: QPay fallback check failed:', qpayErr)
      }
    }

    // If the hold is gone and the payment is still pending, the hold expired
    const status =
      currentStatus === 'pending' && !holdExpiresAt
        ? 'hold_expired'
        : currentStatus

    return new Response(
      JSON.stringify({
        status,
        bookingId:        bookingId ?? undefined,
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
