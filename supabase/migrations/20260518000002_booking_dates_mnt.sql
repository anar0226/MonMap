-- Anchor booking-date validation to Asia/Ulaanbaatar.
--
-- Mongolia is UTC+8 with no DST. The previous trigger used CURRENT_DATE,
-- which in Supabase is UTC. Between 16:00 and 24:00 UTC (00:00-08:00 MNT
-- the next calendar day), CURRENT_DATE = "yesterday" in Ulaanbaatar — so a
-- user submitting a booking at 1am Mongolia time could pass a booked_date
-- equal to the previous calendar day and the trigger would still accept it,
-- because to the trigger it was still "today".
--
-- The resulting row had booked_date one day in the past locally, so the
-- portal's day/calendar views never surfaced it.

CREATE OR REPLACE FUNCTION public.enforce_booking_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_today  date := (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date;
  v_recent int;
  v_today_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'bookings.insert requires authentication'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.booked_date < v_today THEN
    RAISE EXCEPTION 'booked_date must be today or later'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_recent
  FROM public.bookings
  WHERE user_id = v_uid
    AND created_at > now() - interval '1 hour';

  IF v_recent >= 20 THEN
    RAISE EXCEPTION 'booking rate limit exceeded (max 20/hour)'
      USING ERRCODE = 'too_many_connections';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.bookings
  WHERE user_id = v_uid
    AND created_at > now() - interval '24 hours';

  IF v_today_count >= 100 THEN
    RAISE EXCEPTION 'booking rate limit exceeded (max 100/day)'
      USING ERRCODE = 'too_many_connections';
  END IF;

  RETURN NEW;
END;
$$;
