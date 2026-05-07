-- ============================================================
-- Security hardening — addresses 4 critical findings.
-- ============================================================
-- C-1  Leaky push-token RLS policy (USING true) — drop it. Service role
--      bypasses RLS, so it never needed this policy.
-- C-2  Anonymous booking insertion → SMS bombing / Twilio cost-DoS.
--      Require auth, validate booked_date / party_size, cap insert rate.
-- C-3  Closure-report DoS (10 anonymous inserts hide any business). Require
--      auth, dedupe by (place_id, user_id), cap reports per user per day.
-- ============================================================

-- ─── C-1 ────────────────────────────────────────────────────
-- Drop the over-broad SELECT policy. Service role always bypasses RLS.
DROP POLICY IF EXISTS "user_push_tokens_service_read" ON public.user_push_tokens;

-- ─── C-2 ────────────────────────────────────────────────────
-- 1. Require auth on insert. The previous policy allowed user_id=null which
--    let any anonymous caller spam Twilio via the notify-booking trigger.
--
--    Verified business owners may insert with user_id=null on their own
--    place_id (the portal's "owner adds walk-in" flow). This still requires
--    auth, and a compromised owner can only spam SMS to their own phone.
DROP POLICY IF EXISTS "bookings: insert own" ON public.bookings;
CREATE POLICY "bookings: insert own"
  ON public.bookings FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      auth.uid() = user_id
      OR (
        user_id IS NULL AND EXISTS (
          SELECT 1 FROM public.business_owners bo
          WHERE bo.place_id     = bookings.place_id
            AND bo.user_id      = auth.uid()
            AND bo.claim_status = 'verified'
        )
      )
    )
  );

-- 2. Sanity bounds: future date, sane party size. Prevents an attacker from
--    flooding bookings with 1000-seat reservations or far-past dates.
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_booked_date_future;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booked_date_future
  CHECK (booked_date >= '2020-01-01');
-- "today or later" is enforced via trigger (CHECK can't reference now()).

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_party_size_bounds;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_party_size_bounds
  CHECK (party_size BETWEEN 1 AND 50);

-- 3. Per-user rate limit: cap how often a user may create new bookings.
--    Authenticated abuse is the only path now (RLS above), but a single
--    malicious user could still loop-insert. 20/hour, 100/day is generous
--    for legitimate flows but blocks scripted bombing.
CREATE OR REPLACE FUNCTION public.enforce_booking_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_recent int;
  v_today int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'bookings.insert requires authentication'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.booked_date < CURRENT_DATE THEN
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

  SELECT count(*) INTO v_today
  FROM public.bookings
  WHERE user_id = v_uid
    AND created_at > now() - interval '24 hours';

  IF v_today >= 100 THEN
    RAISE EXCEPTION 'booking rate limit exceeded (max 100/day)'
      USING ERRCODE = 'too_many_connections';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_rate_limit ON public.bookings;
CREATE TRIGGER bookings_rate_limit
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_rate_limit();

-- ─── C-3 ────────────────────────────────────────────────────
-- Closure reports: tie every report to a user, cap at one per place per
-- user, and cap total reports per user per day. The mobile-only AsyncStorage
-- dedup is bypassable; this enforces it server-side.
ALTER TABLE public.place_closure_reports
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Historical rows pre-date the user_id column and stay NULL. New rows must
-- carry a non-null user_id (enforced by the RLS policy below + trigger).
-- Postgres treats NULLs as distinct in a UNIQUE index, so the legacy rows
-- don't collide with the new dedupe constraint.
CREATE UNIQUE INDEX IF NOT EXISTS place_closure_reports_user_place_uniq
  ON public.place_closure_reports(place_id, user_id);

DROP POLICY IF EXISTS "closure_reports: anyone can report" ON public.place_closure_reports;
CREATE POLICY "closure_reports: authed insert own"
  ON public.place_closure_reports FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- SECURITY DEFINER + locked search_path: the table has no SELECT policy for
-- the anon/authenticated roles, so without DEFINER the count would always
-- return 0 and the rate limit would be a silent no-op.
CREATE OR REPLACE FUNCTION public.enforce_closure_report_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today int;
BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'closure report requires authentication'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO v_today
  FROM public.place_closure_reports
  WHERE user_id = NEW.user_id
    AND created_at > now() - interval '24 hours';

  IF v_today >= 5 THEN
    RAISE EXCEPTION 'closure report rate limit exceeded (max 5/day per user)'
      USING ERRCODE = 'too_many_connections';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS closure_reports_rate_limit ON public.place_closure_reports;
CREATE TRIGGER closure_reports_rate_limit
  BEFORE INSERT ON public.place_closure_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_closure_report_limit();
