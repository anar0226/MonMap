// QPay payment webhook — called by QPay's servers when a payment is completed.
// This is the authoritative point where a booking row is created after payment.
//
// IMPORTANT: This endpoint MUST be deployed with verify_jwt=false. QPay's servers
// don't have a Supabase JWT and the gateway returns 401 before this handler runs
// if verify_jwt is on. We do not rely on this endpoint being unauthenticated for
// security — every callback is independently verified by calling QPay's check API
// before any booking is created.
//
// QPay v2 webhook delivery quirks:
//   - May be GET or POST depending on merchant config
//   - GET: payload is in query string (?qpay_payment_id=...&qpay_invoice_id=...&sender_invoice_no=...)
//   - POST: payload is JSON body with similar fields
// We accept either shape and extract whatever identifiers are present, then look
// up our payment row by sender_invoice_no → qpay_invoice_id → (fetch QPay payment
// to get the invoice id) in that order.
//
// Required secrets:
//   QPAY_CLIENT_ID, QPAY_CLIENT_SECRET, QPAY_INVOICE_CODE
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkQPayInvoice, getQPayPaymentById, refundQPayPayment } from '../_shared/qpay.ts'
import { reportError } from '../_shared/errors.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface CallbackPayload {
  qpay_payment_id?: string
  qpay_invoice_id?: string
  invoice_id?: string
  sender_invoice_no?: string
  payment_status?: string
  status?: string
  paid_amount?: number
}

async function extractPayload(req: Request): Promise<CallbackPayload> {
  // 1) Pull everything from the URL query string. QPay v2 typically GETs the
  //    callback with qpay_payment_id (and sometimes the others) as query params.
  const url = new URL(req.url)
  const fromQuery: CallbackPayload = {
    qpay_payment_id:   url.searchParams.get('qpay_payment_id')   ?? undefined,
    qpay_invoice_id:   url.searchParams.get('qpay_invoice_id')   ?? undefined,
    invoice_id:        url.searchParams.get('invoice_id')        ?? undefined,
    sender_invoice_no: url.searchParams.get('sender_invoice_no') ?? undefined,
    payment_status:    url.searchParams.get('payment_status')    ?? undefined,
    status:            url.searchParams.get('status')            ?? undefined,
  }

  // 2) Merge in the JSON body if present (only POST/PUT typically have bodies).
  let fromBody: CallbackPayload = {}
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const text = await req.text()
      if (text) fromBody = JSON.parse(text) as CallbackPayload
    } catch {
      // Body wasn't valid JSON — fall through with the query-only payload.
    }
  }

  return { ...fromQuery, ...fromBody }
}

Deno.serve(async (req) => {
  try {
    const body = await extractPayload(req)
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Resolve our local payment row from whichever identifiers QPay sent.
    let payment: Record<string, any> | null = null
    let qpayInvoiceIdFromLookup: string | null = null

    if (body.sender_invoice_no) {
      const { data } = await db
        .from('payments')
        .select('*')
        .eq('id', body.sender_invoice_no)
        .maybeSingle()
      payment = data ?? null
    }

    if (!payment && (body.qpay_invoice_id || body.invoice_id)) {
      const inv = body.qpay_invoice_id ?? body.invoice_id!
      const { data } = await db
        .from('payments')
        .select('*')
        .eq('qpay_invoice_id', inv)
        .maybeSingle()
      payment = data ?? null
    }

    // QPay sometimes sends ONLY qpay_payment_id. Fetch the payment from QPay,
    // pull out its invoice_id/sender_invoice_no, then look up our row.
    if (!payment && body.qpay_payment_id) {
      try {
        const qpayPayment = await getQPayPaymentById(body.qpay_payment_id)
        qpayInvoiceIdFromLookup = qpayPayment.invoiceId

        if (qpayPayment.senderInvoiceNo) {
          const { data } = await db
            .from('payments')
            .select('*')
            .eq('id', qpayPayment.senderInvoiceNo)
            .maybeSingle()
          payment = data ?? null
        }
        if (!payment && qpayPayment.invoiceId) {
          const { data } = await db
            .from('payments')
            .select('*')
            .eq('qpay_invoice_id', qpayPayment.invoiceId)
            .maybeSingle()
          payment = data ?? null
        }
      } catch (lookupErr) {
        console.warn('payment-webhook: QPay payment lookup failed', lookupErr)
      }
    }

    if (!payment) {
      console.warn('payment-webhook: payment record not found', body)
      // 200 so QPay doesn't retry — we don't know this invoice.
      return new Response(JSON.stringify({ ok: true, found: false }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Idempotency — if already paid, acknowledge and stop.
    if (payment.status === 'paid') {
      return new Response(JSON.stringify({ ok: true, alreadyProcessed: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Explicit failure from the callback — mark failed and release the hold.
    const incomingStatus = body.payment_status ?? body.status ?? ''
    if (incomingStatus === 'CANCELLED' || incomingStatus === 'FAILED') {
      await db.from('payments').update({ status: 'failed', webhook_payload: body }).eq('id', payment.id)
      if (payment.hold_id) {
        await db.from('slot_holds').delete().eq('id', payment.hold_id)
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Verify the payment is genuine by calling QPay's check API.
    // This is the security boundary — we never trust the callback body alone.
    const invoiceIdToCheck = payment.qpay_invoice_id ?? body.qpay_invoice_id ?? body.invoice_id ?? qpayInvoiceIdFromLookup
    if (!invoiceIdToCheck) {
      console.warn('payment-webhook: no qpay_invoice_id available to verify', payment.id)
      return new Response(JSON.stringify({ ok: true, verified: false }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const checkResult = await checkQPayInvoice(invoiceIdToCheck)
    if (checkResult.status !== 'PAID') {
      console.warn('payment-webhook: QPay check returned non-PAID status', checkResult)
      return new Response(JSON.stringify({ ok: true, verified: false }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Fetch the associated slot hold.
    let hold: Record<string, unknown> | null = null
    if (payment.hold_id) {
      const { data: holdData } = await db
        .from('slot_holds')
        .select('*')
        .eq('id', payment.hold_id)
        .maybeSingle()
      hold = holdData
    }

    if (!hold || new Date(hold.expires_at as string) < new Date()) {
      // Hold expired — refund since we can't honour the slot.
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
          reportError(refundErr, {
            source: 'payment-webhook',
            context: { phase: 'auto-refund', paymentId: payment.id, qpayInvoiceId: invoiceIdToCheck, qpayPaymentId: checkResult.paymentId },
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

    // Atomic: create booking + mark payment paid + delete hold.
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
      p_qpay_payment_id: checkResult.paymentId ?? body.qpay_payment_id ?? null,
    })

    if (rpcErr) {
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

    // Fire notify-booking — fire-and-forget.
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
    reportError(err, { source: 'payment-webhook', context: { phase: 'top-level' } })
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
