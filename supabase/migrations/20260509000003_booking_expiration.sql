-- ============================================================
-- Booking expiration: auto-expire pending bookings after 30 min
-- ============================================================
-- Rationale:
--   A guest books at 11:47 for 19:00.  Owner ignores the SMS / web push.
--   Without expiration the booking sits in 'pending' forever — guest has no
--   idea whether they have a table.  We auto-flip to 'expired' after 30 min,
--   then fire notify-guest with the failure branch so they get a push + SMS
--   suggesting they call the venue or pick another place.
--
-- This migration is idempotent — safe to re-apply.

-- ── 1. Allow 'expired' status ────────────────────────────────────────────────
-- The existing CHECK only permits pending/confirmed/cancelled.  We need to
-- drop and re-add it because Postgres has no "ALTER CHECK" syntax.

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'confirmed'::text,
    'cancelled'::text,
    'expired'::text
  ]));

-- ── 2. Track when the row was expired ────────────────────────────────────────
-- Useful for analytics ("what % of bookings expire?") and idempotency
-- (re-running the cron won't re-process rows that are already expired).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS expired_at timestamptz;

-- Partial index so the cron's "find pending older than 30 min" query is cheap
-- regardless of how many historical bookings exist.
CREATE INDEX IF NOT EXISTS bookings_pending_expired_idx
  ON public.bookings (created_at)
  WHERE status = 'pending';

-- ── 3. Enable pg_net so pg_cron jobs can fire HTTP requests ──────────────────
-- pg_cron is already installed; pg_net is required to invoke edge functions
-- from inside cron jobs.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- Cron schedule (manual one-time setup after deploy)
-- ============================================================
-- The cron job is intentionally NOT created here — it requires a CRON_SECRET
-- that must match the secret set on the edge function via
-- `supabase secrets set CRON_SECRET=<random>`.
--
-- After deploying the expire-bookings function, run the SQL below (replacing
-- both the project ref and CRON_SECRET_VALUE with real values):
--
-- /*
-- SELECT cron.schedule(
--   'expire-pending-bookings',
--   '*/5 * * * *',                   -- every 5 minutes
--   $$
--   SELECT net.http_post(
--     url     := 'https://brykoxmygtiyrssmsvys.supabase.co/functions/v1/expire-bookings',
--     headers := '{"Content-Type":"application/json","x-cron-secret":"CRON_SECRET_VALUE"}'::jsonb,
--     body    := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );
-- */
--
-- The previously-commented `send-booking-reminders` cron from migration
-- 20260505000001 was never enabled either; if you want reminder SMS to fire,
-- schedule that one alongside this one with the same CRON_SECRET.
