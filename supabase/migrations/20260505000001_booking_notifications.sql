-- Track whether a business-owner reminder SMS has been sent for this booking.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;

-- Efficient index for the send-reminders edge function query.
CREATE INDEX IF NOT EXISTS bookings_reminder_pending_idx
  ON public.bookings (booked_date, time_slot)
  WHERE reminder_sent = false AND status <> 'cancelled';

-- ============================================================
-- pg_cron: fire send-reminders every 30 minutes
-- ============================================================
-- Prerequisites (one-time, run via Supabase SQL editor or CLI):
--
--   1. Enable extensions in Dashboard → Database → Extensions:
--        pg_cron   (schedule jobs)
--        pg_net    (make HTTP calls from SQL)
--
--   2. Set Supabase secrets (CLI):
--        supabase secrets set TWILIO_ACCOUNT_SID=ACxxxx
--        supabase secrets set TWILIO_AUTH_TOKEN=xxxx
--        supabase secrets set TWILIO_FROM_NUMBER=+1xxxxxxxxxx
--        supabase secrets set CRON_SECRET=<any-random-string>
--
--   3. Deploy the edge functions:
--        supabase functions deploy notify-booking
--        supabase functions deploy send-reminders
--
--   4. Replace CRON_SECRET_VALUE below with the random string from step 2,
--      then uncomment and run this block in the SQL editor:

/*
SELECT cron.schedule(
  'send-booking-reminders',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://brykoxmygtiyrssmsvys.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type":"application/json","x-cron-secret":"CRON_SECRET_VALUE"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
*/
