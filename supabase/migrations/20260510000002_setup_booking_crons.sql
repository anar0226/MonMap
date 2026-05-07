-- ============================================================
-- One-shot setup helper for booking cron jobs
-- ============================================================
-- The two-stage booking flow only works when these jobs are running:
--
--   * expire-pending-bookings  (every 5 min)  — flips stale 'pending' rows to
--     'expired' and notifies the guest. Without it, ignored bookings sit
--     forever and the user has no idea whether they have a table.
--
--   * send-booking-reminders   (every 30 min) — sends owner SMS reminders for
--     upcoming confirmed bookings.
--
-- Both jobs require pg_net (HTTP from SQL) and pg_cron (scheduling), and need
-- a shared secret (CRON_SECRET) that the edge functions verify on every call.
-- That secret can't be known at migration time, so this file ships a helper
-- function that the operator runs once after setting up secrets.
--
-- One-time setup, end-to-end:
--
--   1. Enable extensions (Dashboard → Database → Extensions):
--        pg_cron
--        pg_net
--
--   2. Set CRON_SECRET on the edge functions:
--        supabase secrets set CRON_SECRET=<random>
--
--   3. Deploy the edge functions:
--        supabase functions deploy expire-bookings
--        supabase functions deploy send-reminders
--
--   4. Run this once in the SQL editor (replace both args with real values):
--        SELECT public.setup_booking_crons(
--          'https://<your-project>.supabase.co',
--          '<the CRON_SECRET from step 2>'
--        );
--
-- Re-running is safe — existing schedules are unscheduled first.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.setup_booking_crons(
  project_url  text,
  cron_secret  text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers jsonb;
BEGIN
  IF project_url IS NULL OR project_url = '' THEN
    RAISE EXCEPTION 'project_url is required (e.g. https://abc.supabase.co)';
  END IF;
  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE EXCEPTION 'cron_secret is required and must match the edge-function CRON_SECRET';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', cron_secret
  );

  -- Drop any prior schedules so re-running picks up new URLs / secrets cleanly.
  PERFORM cron.unschedule(jobid)
    FROM cron.job
   WHERE jobname IN ('expire-pending-bookings', 'send-booking-reminders');

  PERFORM cron.schedule(
    'expire-pending-bookings',
    '*/5 * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url     := %L,
        headers := %L::jsonb,
        body    := '{}'::jsonb
      );
      $cron$,
      project_url || '/functions/v1/expire-bookings',
      v_headers::text
    )
  );

  PERFORM cron.schedule(
    'send-booking-reminders',
    '*/30 * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url     := %L,
        headers := %L::jsonb,
        body    := '{}'::jsonb
      );
      $cron$,
      project_url || '/functions/v1/send-reminders',
      v_headers::text
    )
  );

  RETURN 'scheduled: expire-pending-bookings (*/5 min), send-booking-reminders (*/30 min)';
END;
$$;

REVOKE ALL ON FUNCTION public.setup_booking_crons(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_booking_crons(text, text) TO postgres;
