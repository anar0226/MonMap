// Creates a QPay invoice and a temporary slot hold for a deposit booking.
// Called by the app when the user taps "Confirm" on a place that requires a deposit.
//
// Required secrets:
//   QPAY_CLIENT_ID, QPAY_CLIENT_SECRET, QPAY_INVOICE_CODE
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createQPayInvoice } from '../_shared/qpay.ts'
import { reportError } from '../_shared/errors.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  try {
    // Authenticated users only — anonymous users cannot complete QPay payments.
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

    const body = await req.json()
    const {
      idempotencyKey,
      placeId, date, timeSlot, partySize,
      guestName, guestPhone, service, serviceId, durationMinutes,
      applyCreditMnt,
    } = body
    const requestedCredit = Math.max(0, Number(applyCreditMnt) || 0)

    if (!placeId || !date || !timeSlot || !partySize || !guestName) {
      return new Response('Missing required fields', { status: 400 })
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Idempotency: if the caller already initiated a payment intent with this
    // key and the hold is still alive, return the cached invoice instead of
    // creating duplicate hold + QPay invoice. Protects against retries on flaky
    // mobile networks where the original request succeeded but the response
    // never reached the client.
    if (idempotencyKey) {
      const { data: existing } = await db
        .from('payments')
        .select('id, hold_id, amount, qpay_qr_image, qpay_urls, status')
        .eq('user_id', callerId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()

      if (existing) {
        if (existing.status === 'paid') {
          return new Response(
            JSON.stringify({ error: 'already_paid', paymentId: existing.id }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (existing.status === 'pending' && existing.hold_id) {
          const { data: hold } = await db
            .from('slot_holds')
            .select('expires_at')
            .eq('id', existing.hold_id)
            .maybeSingle()
          if (hold && new Date(hold.expires_at).getTime() > Date.now()) {
            return new Response(
              JSON.stringify({
                paymentId:     existing.id,
                holdId:        existing.hold_id,
                holdExpiresAt: hold.expires_at,
                amount:        existing.amount,
                qpayQrImage:   existing.qpay_qr_image,
                qpayUrls:      existing.qpay_urls,
              }),
              { headers: { 'Content-Type': 'application/json' } },
            )
          }
        }
        // Same key, but the underlying hold expired or the row is in an
        // unexpected state. We can't reuse the key on a new row (unique
        // index), so make the client generate a fresh one.
        return new Response(
          JSON.stringify({
            error: 'idempotency_key_stale',
            message: 'Захиалгын хугацаа дууссан байна. Дахин эхлүүлнэ үү.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }

    // Verify the place requires a deposit.
    const { data: place, error: placeErr } = await db
      .from('places')
      .select('name, deposit_amount, slot_capacity')
      .eq('place_id', placeId)
      .single()

    if (placeErr || !place) {
      return new Response('Place not found', { status: 404 })
    }

    // Resolve the deposit amount: per-service deposit takes priority over
    // the place-level default so owners can price deposits individually.
    let effectiveDeposit: number | null = place.deposit_amount
    if (serviceId) {
      const { data: svc } = await db
        .from('services')
        .select('deposit')
        .eq('id', serviceId)
        .eq('place_id', placeId)
        .maybeSingle()
      if (svc?.deposit != null) effectiveDeposit = svc.deposit
    }

    if (effectiveDeposit == null || effectiveDeposit <= 0) {
      return new Response(
        'This place does not require a deposit — use the standard booking flow',
        { status: 400 },
      )
    }

    const slotCapacity: number = place.slot_capacity ?? 8

    // Atomic capacity check + hold insert. The RPC takes a transactional
    // advisory lock on the slot triple so two concurrent requests for the
    // same slot can't both pass the capacity check and both insert holds.
    const { data: holdRows, error: holdErr } = await db.rpc('create_slot_hold', {
      p_place_id:      placeId,
      p_booked_date:   date,
      p_time_slot:     timeSlot,
      p_party_size:    partySize,
      p_user_id:       callerId,
      p_guest_name:    guestName,
      p_guest_phone:   guestPhone ?? null,
      p_service:       service ?? null,
      p_duration_mins: durationMinutes ?? null,
      p_slot_capacity: slotCapacity,
    })

    if (holdErr) {
      if (String(holdErr.message ?? '').includes('slot_full')) {
        return new Response(
          JSON.stringify({ error: 'slot_full', message: 'Уучлаарай, энэ цаг захиалгаар дүүрсэн байна.' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        )
      }
      console.error('create_slot_hold rpc failed:', holdErr)
      return new Response('Failed to create slot hold', { status: 500 })
    }

    const holdRow = Array.isArray(holdRows) ? holdRows[0] : holdRows
    if (!holdRow?.hold_id) {
      console.error('create_slot_hold returned no rows')
      return new Response('Failed to create slot hold', { status: 500 })
    }
    const holdId        = holdRow.hold_id as string
    const holdExpiresAt = holdRow.expires_at as string

    // Insert pending payment row to get its UUID for QPay. The idempotency
    // key (if any) is unique per user so a retry that races past the
    // idempotency lookup above still fails fast on the unique index instead
    // of creating a duplicate QPay invoice.
    const { data: payment, error: paymentErr } = await db
      .from('payments')
      .insert({
        hold_id:         holdId,
        place_id:        placeId,
        user_id:         callerId,
        amount:          effectiveDeposit,
        idempotency_key: idempotencyKey ?? null,
      })
      .select('id')
      .single()

    if (paymentErr || !payment) {
      console.error('payments insert failed:', paymentErr)
      // Clean up the hold we just created
      await db.from('slot_holds').delete().eq('id', holdId)
      return new Response('Failed to create payment record', { status: 500 })
    }

    // Apply wallet credit if requested. Idempotent on payments.id.
    let creditApplied = 0
    if (requestedCredit > 0) {
      const { data: c, error: cErr } = await db.rpc('apply_booking_credit', {
        p_payment_id: payment.id,
        p_max_credit: requestedCredit,
      })
      if (cErr) console.warn('apply_booking_credit error', cErr)
      else creditApplied = Number(c) || 0
    }

    const qpayAmount = Math.max(0, effectiveDeposit - creditApplied)

    // If credit covers the full deposit, skip QPay and confirm immediately.
    if (qpayAmount === 0) {
      const { data: bookingId, error: confirmErr } = await db.rpc('confirm_credit_only_booking', {
        p_payment_id:     payment.id,
        p_hold_id:        holdId,
        p_user_id:        callerId,
        p_place_id:       placeId,
        p_booked_date:    date,
        p_time_slot:      timeSlot,
        p_party_size:     partySize,
        p_guest_name:     guestName,
        p_guest_phone:    guestPhone ?? null,
        p_service:        service ?? null,
        p_duration_mins:  durationMinutes ?? null,
        p_deposit_amount: effectiveDeposit,
      })
      if (confirmErr) {
        console.error('confirm_credit_only_booking failed', confirmErr)
        return new Response('Failed to confirm credit-only booking', { status: 500 })
      }
      return new Response(
        JSON.stringify({
          status:           'credit_only_paid',
          paymentId:        payment.id,
          bookingId,
          creditApplied,
          amount:           0,
          originalDeposit:  effectiveDeposit,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Create QPay invoice for the remaining amount.
    const callbackUrl = `${SUPABASE_URL}/functions/v1/payment-webhook`
    const invoice = await createQPayInvoice({
      senderInvoiceNo: payment.id,
      description: `MonMap захиалга — ${place.name} ${date} ${timeSlot}`,
      amount: qpayAmount,
      callbackUrl,
    })

    // Store QPay data on the payment row and update amount to the reduced figure.
    await db
      .from('payments')
      .update({
        amount:          qpayAmount,
        qpay_invoice_id: invoice.invoiceId,
        qpay_qr_image:   invoice.qrImage,
        qpay_urls:       invoice.urls,
      })
      .eq('id', payment.id)

    return new Response(
      JSON.stringify({
        paymentId:       payment.id,
        holdId:          holdId,
        holdExpiresAt,
        amount:          qpayAmount,
        originalDeposit: effectiveDeposit,
        creditApplied,
        qpayQrImage:     invoice.qrImage,
        qpayUrls:        invoice.urls,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    // P1 — user couldn't even start a payment. Likely QPay token/credential
    // failure or DB error during hold/payment insert. Surface immediately so
    // we don't accumulate failures while debugging.
    reportError(err, { source: 'create-payment-intent', context: { phase: 'top-level' } })
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
