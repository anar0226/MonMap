-- Atomic capacity check + slot hold insert.
-- Replaces the read-then-write sequence in create-payment-intent, which was
-- racy: two concurrent requests could both see the slot has room and both
-- insert holds that together exceed capacity. A transactional advisory lock
-- keyed on (place_id, booked_date, time_slot) serializes the check+insert
-- for the same slot while leaving unrelated slots fully concurrent.
--
-- Raises a P0001 'slot_full' exception when capacity would be exceeded; the
-- edge function maps this back to a 409 for the client.
CREATE OR REPLACE FUNCTION public.create_slot_hold(
  p_place_id       text,
  p_booked_date    date,
  p_time_slot      text,
  p_party_size     smallint,
  p_user_id        uuid,
  p_guest_name     text,
  p_guest_phone    text,
  p_service        text,
  p_duration_mins  integer,
  p_slot_capacity  integer,
  p_hold_minutes   integer DEFAULT 10
) RETURNS TABLE (hold_id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key     bigint;
  v_booked       integer;
  v_held         integer;
  v_hold_id      uuid;
  v_expires_at   timestamptz;
BEGIN
  v_lock_key := hashtextextended(
    p_place_id || '|' || p_booked_date::text || '|' || p_time_slot, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(SUM(party_size), 0) INTO v_booked
  FROM public.bookings
  WHERE place_id    = p_place_id
    AND booked_date = p_booked_date
    AND time_slot   = p_time_slot
    AND status NOT IN ('cancelled', 'expired');

  SELECT COALESCE(SUM(party_size), 0) INTO v_held
  FROM public.slot_holds
  WHERE place_id    = p_place_id
    AND booked_date = p_booked_date
    AND time_slot   = p_time_slot
    AND expires_at  > now();

  IF v_booked + v_held + p_party_size > p_slot_capacity THEN
    RAISE EXCEPTION 'slot_full' USING ERRCODE = 'P0001';
  END IF;

  v_expires_at := now() + make_interval(mins => p_hold_minutes);

  INSERT INTO public.slot_holds (
    place_id, booked_date, time_slot, party_size,
    user_id, guest_name, guest_phone, service, duration_minutes, expires_at
  ) VALUES (
    p_place_id, p_booked_date, p_time_slot, p_party_size,
    p_user_id, p_guest_name, p_guest_phone, p_service, p_duration_mins, v_expires_at
  )
  RETURNING id INTO v_hold_id;

  hold_id    := v_hold_id;
  expires_at := v_expires_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_slot_hold(
  text, date, text, smallint, uuid, text, text, text, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_slot_hold(
  text, date, text, smallint, uuid, text, text, text, integer, integer, integer
) TO service_role;
