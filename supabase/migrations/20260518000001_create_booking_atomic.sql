-- Atomic capacity-checked booking insert. Replaces the read-then-insert path
-- in useBooking.submitBooking, which was racy: two concurrent users seeing
-- "4 covers remaining" could each INSERT a party_size=4 booking, doubling
-- the slot. The DB only enforced party_size bounds (1-50), never slot
-- capacity, so the over-capacity rows landed silently.
--
-- Uses the same advisory-lock key as create_slot_hold (place_id|date|time_slot)
-- so deposit holds and free bookings cannot race against each other for the
-- same slot. Capacity counts live bookings + unexpired holds, matching the
-- check inside create_slot_hold.
--
-- SECURITY INVOKER: the INSERT must respect the existing RLS policy
-- ("bookings: insert own") and fire enforce_booking_rate_limit, both of which
-- look at auth.uid(). DEFINER would break both.

CREATE OR REPLACE FUNCTION public.create_booking(
  p_place_id      text,
  p_booked_date   date,
  p_time_slot     text,
  p_party_size    smallint,
  p_guest_name    text,
  p_guest_phone   text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_lock_key  bigint;
  v_capacity  integer;
  v_booked    integer;
  v_held      integer;
  v_id        bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_lock_key := hashtextextended(
    p_place_id || '|' || p_booked_date::text || '|' || p_time_slot, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT slot_capacity INTO v_capacity
  FROM public.places
  WHERE place_id = p_place_id;

  IF v_capacity IS NULL THEN
    -- Pre-20260506 rows have no slot_capacity column value; treat as unbounded
    -- so the lock+check is a pure no-op for legacy places.
    v_capacity := 2147483647;
  END IF;

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

  IF v_booked + v_held + p_party_size > v_capacity THEN
    RAISE EXCEPTION 'slot_full' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.bookings (
    user_id, place_id, booked_date, time_slot,
    party_size, guest_name, guest_phone, status
  ) VALUES (
    v_uid, p_place_id, p_booked_date, p_time_slot,
    p_party_size, p_guest_name, p_guest_phone, 'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking(
  text, date, text, smallint, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(
  text, date, text, smallint, text, text
) TO authenticated;
