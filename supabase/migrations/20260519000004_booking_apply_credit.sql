-- Adds wallet-credit support to the deposit booking flow.
-- The deposit path runs through create-payment-intent → QPay → payment-webhook.
-- To let users spend traffic-earnings credit, we:
--   1. Snapshot the requested credit on the payments row.
--   2. Provide an RPC apply_booking_credit() that debits the wallet ledger
--      and stamps payments.wallet_credit_applied with the amount actually
--      debited. Called from create-payment-intent before generating the QPay
--      invoice, so the invoice is for (deposit - credit_applied).
--   3. Provide confirm_credit_only_booking() for the zero-deposit case
--      (credit covers full deposit) — skips QPay entirely.
--
-- The credit debit is idempotent on payments.id: re-running returns the
-- already-applied amount without double-debiting.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS wallet_credit_applied integer NOT NULL DEFAULT 0
    CHECK (wallet_credit_applied >= 0);

-- ---------------------------------------------------------------------------
-- apply_booking_credit
-- Atomically debits up to p_max_credit from the user's wallet and records
-- the amount on the payments row. Returns the actual credit applied.
-- Idempotent: if the payment already has wallet_credit_applied > 0, returns
-- that value without further debiting.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_booking_credit(
  p_payment_id  uuid,
  p_max_credit  integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        uuid;
  v_amount      integer;
  v_already     integer;
  v_debited     integer;
BEGIN
  IF p_max_credit <= 0 THEN
    RETURN 0;
  END IF;

  SELECT user_id, amount, wallet_credit_applied
  INTO v_user, v_amount, v_already
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_already > 0 THEN
    RETURN v_already;
  END IF;

  -- Clamp request to the payment amount — never debit more than the deposit.
  v_debited := public.debit_wallet(
    v_user,
    LEAST(p_max_credit, v_amount),
    'spend_booking',
    p_payment_id,
    jsonb_build_object('payment_id', p_payment_id::text)
  );

  UPDATE public.payments
  SET wallet_credit_applied = v_debited,
      updated_at = now()
  WHERE id = p_payment_id;

  RETURN v_debited;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_booking_credit(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_booking_credit(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- confirm_credit_only_booking
-- Used when applied credit covers the full deposit so QPay is skipped.
-- Creates the booking, marks the payment as paid with amount=0, deletes the
-- hold. Mirrors confirm_paid_booking but without the QPay payload.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_credit_only_booking(
  p_payment_id      uuid,
  p_hold_id         uuid,
  p_user_id         uuid,
  p_place_id        text,
  p_booked_date     date,
  p_time_slot       text,
  p_party_size      smallint,
  p_guest_name      text,
  p_guest_phone     text,
  p_service         text,
  p_duration_mins   integer,
  p_deposit_amount  integer
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id bigint;
BEGIN
  INSERT INTO public.bookings (
    user_id, place_id, booked_date, time_slot, party_size,
    guest_name, guest_phone, service, duration_minutes,
    status, payment_id, deposit_amount
  ) VALUES (
    p_user_id, p_place_id, p_booked_date, p_time_slot, p_party_size,
    p_guest_name, p_guest_phone, p_service, p_duration_mins,
    'pending', p_payment_id, p_deposit_amount
  )
  RETURNING id INTO v_booking_id;

  UPDATE public.payments
  SET status      = 'paid',
      booking_id  = v_booking_id,
      paid_at     = now(),
      updated_at  = now()
  WHERE id = p_payment_id;

  DELETE FROM public.slot_holds WHERE id = p_hold_id;

  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_credit_only_booking FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_credit_only_booking TO service_role;
