-- Fix ambiguous `expires_at` column reference in create_slot_hold.
-- The RETURNS TABLE declares an output column named `expires_at`, which
-- conflicts with slot_holds.expires_at in the WHERE clause, causing:
--   ERROR 42702: column reference "expires_at" is ambiguous
-- Fix: table-alias every column reference inside the slot_holds query.

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

  SELECT COALESCE(SUM(b.party_size), 0) INTO v_booked
  FROM public.bookings b
  WHERE b.place_id    = p_place_id
    AND b.booked_date = p_booked_date
    AND b.time_slot   = p_time_slot
    AND b.status NOT IN ('cancelled', 'expired');

  SELECT COALESCE(SUM(sh.party_size), 0) INTO v_held
  FROM public.slot_holds sh
  WHERE sh.place_id    = p_place_id
    AND sh.booked_date = p_booked_date
    AND sh.time_slot   = p_time_slot
    AND sh.expires_at  > now();

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
