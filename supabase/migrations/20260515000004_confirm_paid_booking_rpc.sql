-- Atomic function: creates booking + marks payment paid + deletes slot hold.
-- Called by payment-webhook edge function (service role).
-- Returns the new booking's UUID.
CREATE OR REPLACE FUNCTION public.confirm_paid_booking(
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
  p_deposit_amount  integer,
  p_webhook_payload jsonb,
  p_qpay_payment_id text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking_id bigint;
BEGIN
  -- Create the booking
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

  -- Mark payment as paid and link to the new booking
  UPDATE public.payments
  SET
    status          = 'paid',
    booking_id      = v_booking_id,
    paid_at         = now(),
    webhook_payload = p_webhook_payload
      || jsonb_build_object('payment_id', p_qpay_payment_id),
    updated_at      = now()
  WHERE id = p_payment_id;

  -- Delete the slot hold — it's been converted to a real booking
  DELETE FROM public.slot_holds WHERE id = p_hold_id;

  RETURN v_booking_id;
END;
$$;

-- Only callable by service role (edge functions)
REVOKE ALL ON FUNCTION public.confirm_paid_booking FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_paid_booking TO service_role;
