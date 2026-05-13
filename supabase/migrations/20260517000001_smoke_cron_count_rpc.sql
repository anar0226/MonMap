-- Tiny read-only RPC for the smoke-test script (scripts/smoke-test.mjs).
--
-- Returns the count of our two registered cron jobs. Lives in public.* so
-- the PostgREST URL is `/rpc/smoke_cron_count`. Restricted to service_role
-- because cron.job is in a privileged schema — anon must never read it.
--
-- If you remove the smoke script you can also drop this; it has no other
-- consumers.
CREATE OR REPLACE FUNCTION public.smoke_cron_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)
    INTO v_count
    FROM cron.job
   WHERE jobname IN ('expire-pending-bookings', 'send-booking-reminders')
     AND active = true;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.smoke_cron_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.smoke_cron_count() TO service_role;
