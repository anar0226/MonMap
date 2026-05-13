-- Audit log of every notification dispatch attempted by notify-booking and
-- notify-guest. Previously, Twilio/Expo failures were only visible in
-- ephemeral edge function logs — operators had no way to discover that
-- (e.g.) every owner SMS for the last hour had silently 500'd.
--
-- One row per (booking, channel, attempt). Successful and failed attempts
-- both land here so operators can chart delivery rate, not just absolute
-- failures. The booking-side bookings.owner_notified_at / guest_notified_at
-- flags remain authoritative for "was the user reached?"; this table is
-- observability and post-mortem material.
CREATE TABLE public.notification_attempts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    bigint      REFERENCES public.bookings(id) ON DELETE CASCADE,
  channel       text        NOT NULL CHECK (channel IN (
                              'sms_owner', 'sms_guest', 'push_guest'
                            )),
  status        text        NOT NULL CHECK (status IN ('ok', 'error')),
  error_text    text,
  attempted_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notification_attempts_booking_idx
  ON public.notification_attempts (booking_id, attempted_at DESC);

-- Partial index keeps the dead-letter dashboard query cheap regardless of
-- how many successful attempts accumulate.
CREATE INDEX notification_attempts_failed_idx
  ON public.notification_attempts (attempted_at DESC)
  WHERE status = 'error';

ALTER TABLE public.notification_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (edge functions) reads/writes. End users
-- never see these rows directly.
