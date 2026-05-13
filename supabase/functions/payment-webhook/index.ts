// QPay payment webhook — called by QPay's servers when a payment is completed.
// This is the authoritative point where a booking row is created after payment.
//
// Security: We verify the payment is genuine by calling QPay's check-payment API
// rather than relying solely on the webhook body. This prevents fake webhook calls
// from creating bookings without actual payment.
//
// Required secrets:
//   QPAY_CLIENT_ID, QPAY_CLIENT_SECRET, QPAY_INVOICE_CODE
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkQPayInvoice, refundQPayPayment } from '../_shared/qpay.ts'
import { reportError } from '../_shared/errors.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  try {
    const body = await req.json()

    // QPay sends: { payment_id, invoice_id, payment_status, paid_amount, sender_invoice_no, ... }
    const senderInvoiceNo: string = body.sender_invoice_no  // this is our payments.id
    const qpayInvoiceId:   string = body.invoice_id ?? body.qpay_invoice_id

    if (!senderInvoiceNo && !qpayInvoiceId) {
      console.warn('payment-webhook: missing invoice identifiers', body)
      return new Response('Bad Request', { status: 400 })
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Look up our payment record
    let query = db.from('payments').select('*')
    if (senderInvoiceNo) {
      query = query.eq('id', senderInvoiceNo)
    } else {
      query = query.eq('qpay_invoice_id', qpayInvoiceId)
    }
    const { data: payment, error: pErr } = await query.single()

    if (pErr || !payment) {
      console.warn('payment-webhook: payment record not found', senderInvoiceNo, qpayInvoiceId)
      // Return 200 so QPay doesn't retry — we don't know this invoice
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Idempotency — QPay may retry; if already paid, acknowledge and stop
    if (payment.status === 'paid') {
      return new Response(JSON.stringify({ ok: true, alreadyProcessed: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Mark non-paid statuses immediately
    const incomingStatus: string = body.payment_status ?? body.status ?? 'UNKNOWN'

    if (incomingStatus === 'CANCELLED' || incomingStatus === 'FAILED') {
      await db.from('payments').update({ status: 'failed', webhook_payload: body }).eq('id', payment.id)
      if (payment.hold_id) {
        await db.from('slot_holds').delete().eq('id', payment.hold_id)
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Verify the payment is genuine by calling QPay's check API
    // (this prevents fake webhook calls from creating bookings)
    const invoiceIdToCheck = payment.qpay_invoice_id ?? qpayInvoiceId
    const checkResult = await checkQPayInvoice(invoiceIdToCheck)

    if (checkResult.status !== 'PAID') {
      console.warn('payment-webhook: QPay check returned non-PAID status', checkResult)
      return new Response(JSON.stringify({ ok: true, verified: false }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Fetch the associated slot hold
    let hold: Record<string, unknown> | null = null
    if (payment.hold_id) {
      const { data: holdData } = await db
        .from('slot_holds')
        .select('*')
        .eq('id', payment.hold_id)
        .single()
      hold = holdData
    }

    // Check if the slot hold has expired
    if (!hold || new Date(hold.expires_at as string) < new Date()) {
      // Hold expired — refund the payment since we can't honour the slot
      console.warn('payment-webhook: hold expired, initiating refund', payment.id)
      if (checkResult.paymentId) {
        try {
          await refundQPayPayment({
            qpayPaymentId: checkResult.paymentId,
            amount: payment.amount,
            note: 'Захиалгын цаг дууссан — автомат буцаалт',
          })
          await db.from('payments').update({
            status:          'refund_pending',
            refund_reason:   'hold_expired',
            webhook_payload: body,
          }).eq('id', payment.id)
        } catch (refundErr) {
          // Auto-refund failure is a P0 — the user paid, the hold expired, and
          // we couldn't return their money. This needs human attention now.
          reportError(refundErr, {
            source: 'payment-webhook',
            context: { phase: 'auto-refund', paymentId: payment.id, qpayInvoiceId, qpayPaymentId: checkResult.paymentId },
          })
          await db.from('payments').update({ status: 'failed', webhook_payload: body }).eq('id', payment.id)
        }
      } else {
        await db.from('payments').update({ status: 'failed', webhook_payload: body }).eq('id', payment.id)
      }
      return new Response(JSON.stringify({ ok: true, refunded: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // All checks passed — create the booking and confirm the payment atomically.
    // We use an RPC for atomicity since Supabase JS client doesn't expose
    // explicit transactions. The RPC does: INSERT bookings + UPDATE payments + DELETE slot_holds.
    const { data: newBooking, error: rpcErr } = await db.rpc('confirm_paid_booking', {
      p_payment_id:      payment.id,
      p_hold_id:         hold.id as string,
      p_user_id:         payment.user_id,
      p_place_id:        payment.place_id,
      p_booked_date:     hold.booked_date as string,
      p_time_slot:       hold.time_slot as string,
      p_party_size:      hold.party_size as number,
      p_guest_name:      hold.guest_name as string,
      p_guest_phone:     (hold.guest_phone as string) ?? null,
      p_service:         (hold.service as string) ?? null,
      p_duration_mins:   (hold.duration_minutes as number) ?? null,
      p_deposit_amount:  payment.amount,
      p_webhook_payload: body,
      p_qpay_payment_id: checkResult.paymentId ?? null,
    })

    if (rpcErr) {
      // RPC failure here means the user paid but no booking exists — P0.
      // confirm_paid_booking is atomic so either everything succeeded or
      // nothing did; if rpcErr is set the user is owed either a refund or
      // a manual booking creation.
      reportError(rpcErr, {
        source: 'payment-webhook',
        context: { phase: 'confirm_paid_booking', paymentId: payment.id, holdId: hold.id, userId: payment.user_id },
      })
      return new Response(JSON.stringify({ error: rpcErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const bookingId = newBooking

    // Fire notify-booking for the new booking — fire-and-forget
    fetch(`${SUPABASE_URL}/functions/v1/notify-booking`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ bookingId }),
    }).catch(e => console.warn('notify-booking fire-and-forget failed:', e))

    return new Response(JSON.stringify({ ok: true, bookingId }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    // Any throw from the webhook handler is treated as P0 — QPay only fires
    // the webhook once per payment under normal conditions, so a 500 here
    // means a paid booking may be silently dropped.
    reportError(err, { source: 'payment-webhook', context: { phase: 'top-level' } })
    // Return 200 to QPay so they don't retry on our internal errors;
    // we've already reported to the external sink for human follow-up.
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
