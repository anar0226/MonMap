-- ============================================================
-- Track delivery of notify-booking / notify-guest fan-out so the
-- portal can detect bookings whose SMS/push didn't actually go out
-- and re-invoke the edge function on next page load.
--
-- Context: notify-booking and notify-guest are called fire-and-forget
-- from useBooking.ts and utils.js (confirmAndNotify / cancelAndNotify).
-- If Twilio is slow, push fails, or the function 500s, the user is told
-- "booking confirmed" and never finds out the customer wasn't notified.
--
-- These columns let us see, after the fact, whether at least one
-- channel (SMS or push) successfully delivered. The edge functions
-- stamp them on dispatch; the portal queries for stale rows on load.
-- ============================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS owner_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS guest_notified_at timestamptz;

-- Index supports the portal-side retry query in bookings.html: find
-- recently-actioned bookings whose guest delivery never landed.
CREATE INDEX IF NOT EXISTS bookings_pending_guest_notify_idx
  ON public.bookings (place_id, created_at)
  WHERE guest_notified_at IS NULL AND status IN ('confirmed', 'cancelled');

-- Same shape for owner-side dispatch (driven by mobile app guests inserting
-- pending bookings; useful if we later add a mobile-side retry path).
CREATE INDEX IF NOT EXISTS bookings_pending_owner_notify_idx
  ON public.bookings (place_id, created_at)
  WHERE owner_notified_at IS NULL AND status = 'pending';
