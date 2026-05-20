// Cancels a booking, issuing a QPay refund if the deposit refund policy allows it.
// Refund policy: full refund if cancelled ≥2 hours before the booking time;
//                no refund if cancelled within 2 hours (no-show deterrent).
//
// Called by:
//   - Mobile app (BookingsScreen) — user-initiated cancellation
//   - Web portal (owner marking a no-show) — with reason='no_show'
//
// Required secrets:
//   QPAY_CLIENT_ID, QPAY_CLIENT_SECRET, QPAY_INVOICE_CODE
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { refundQPayPayment } from '../_shared/qpay.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const REFUND_WINDOW_HOURS = 2

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!jwt) return new Response('Unauthorized', { status: 401 })

    // Allow service-role calls (from portal or other edge functions)
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

    const { bookingId, reason = 'user_cancel', cancelledBy } = await req.json()
    if (!bookingId) return new Response('Missing bookingId', { status: 400 })

    // Derive cancelled_by if the caller didn't supply it explicitly:
    //   - service-role calls default to 'system' (cron jobs etc.)
    //   - reason='no_show' / 'owner_cancel' come from the owner portal
    //   - everything else from a real user JWT is the customer themselves
    const resolvedCancelledBy: 'customer' | 'business' | 'system' =
      cancelledBy === 'customer' || cancelledBy === 'business' || cancelledBy === 'system'
        ? cancelledBy
        : isServiceRole
          ? 'system'
          : (reason === 'no_show' || reason === 'owner_cancel') ? 'business' : 'customer'

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: booking, error: bErr } = await db
      .from('bookings')
      .select('id, user_id, place_id, booked_date, time_slot, status, payment_id, deposit_amount')
      .eq('id', bookingId)
      .single()

    if (bErr || !booking) {
      return new Response('Booking not found', { status: 404 })
    }

    // Enforce ownership for non-service-role callers
    if (!isServiceRole && booking.user_id !== callerId) {
      return new Response('Forbidden', { status: 403 })
    }

    if (!['pending', 'confirmed'].includes(booking.status)) {
      return new Response(
        JSON.stringify({ error: 'Booking is not in a cancellable state' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Determine refund eligibility
    let shouldRefund = false

    if (booking.payment_id && booking.deposit_amount && reason !== 'no_show') {
      // Parse booking datetime — booked_date is "YYYY-MM-DD", time_slot is "HH:MM"
      const bookingDateTime = new Date(`${booking.booked_date}T${booking.time_slot}:00`)
      const hoursUntilBooking = (bookingDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
      shouldRefund = hoursUntilBooking >= REFUND_WINDOW_HOURS
    }

    // Issue QPay refund if warranted
    if (shouldRefund && booking.payment_id) {
      const { data: payment } = await db
        .from('payments')
        .select('id, amount, webhook_payload, status')
        .eq('id', booking.payment_id)
        .single()

      if (payment && payment.status === 'paid') {
        // QPay's payment_id is stored inside the webhook_payload
        const qpayPaymentId = payment.webhook_payload?.payment_id as string | undefined

        if (qpayPaymentId) {
          try {
            await refundQPayPayment({
              qpayPaymentId,
              amount: payment.amount,
              note: `Захиалга цуцлагдсан — ${bookingId}`,
            })
            await db
              .from('payments')
              .update({ status: 'refund_pending', refund_reason: reason })
              .eq('id', payment.id)
          } catch (refundErr) {
            // Log but don't block cancellation — the deposit can be refunded manually
            console.error('QPay refund failed, booking will still be cancelled:', refundErr)
          }
        } else {
          console.warn('No qpay_payment_id in webhook_payload, cannot auto-refund:', payment.id)
        }
      }
    }

    // Cancel the booking
    await db
      .from('bookings')
      .update({ status: 'cancelled', cancelled_by: resolvedCancelledBy })
      .eq('id', bookingId)

    // Notify owner fire-and-forget
    fetch(`${SUPABASE_URL}/functions/v1/notify-booking`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ bookingId }),
    }).catch(e => console.warn('notify-booking fire-and-forget failed:', e))

    return new Response(
      JSON.stringify({ ok: true, refundInitiated: shouldRefund }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('cancel-booking error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
