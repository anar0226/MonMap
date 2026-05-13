-- Temporary slot holds created during the QPay payment window (10 min TTL).
-- Prevents double-booking while a user completes payment.
-- Holds are converted to real bookings by the payment-webhook edge function on success,
-- or cleaned up by the expire-bookings cron on expiry.
CREATE TABLE public.slot_holds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id         text NOT NULL REFERENCES public.places(place_id) ON DELETE CASCADE,
  booked_date      date NOT NULL,
  time_slot        text NOT NULL,
  party_size       smallint NOT NULL DEFAULT 1,
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_name       text,
  guest_phone      text,
  service          text,
  duration_minutes integer,
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Index for capacity-check lookups. A partial predicate on
-- `expires_at > now()` would shrink the index but Postgres requires index
-- predicates to be IMMUTABLE, and now() is STABLE — so we index the full
-- table. Expired rows are purged by the expire-bookings cron, keeping the
-- index small in practice.
CREATE INDEX slot_holds_slot_idx
  ON public.slot_holds (place_id, booked_date, time_slot);

ALTER TABLE public.slot_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slot_holds_read_own"
  ON public.slot_holds FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "slot_holds_insert_own"
  ON public.slot_holds FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);
