-- Freezes the booking status at notification attempt time so retries replay
-- the original intent rather than mutating with current state.
--
-- The retry flow previously had this surprising behaviour:
--   * Owner SMS fails for a 'pending' booking (Twilio blip)
--   * Guest later cancels → booking.status = 'cancelled'
--   * Owner clicks retry → notify-booking reads current status → sends
--     "❌ Захиалга цуцлагдлаа" instead of the "🔔 Шинэ захиалгын хүсэлт"
--     that was originally meant to be sent.
--
-- Now: notify-booking / notify-guest stamp intended_status on every attempt.
-- The retry RPC returns it, the portal passes it back via the optional
-- `overrideStatus` parameter, and the edge function uses the override to
-- pick the message template. Without an override (e.g. internal callers
-- that aren't retries), behaviour is unchanged.

ALTER TABLE public.notification_attempts
  ADD COLUMN IF NOT EXISTS intended_status text;

-- Drop & recreate the retry RPC to surface intended_status. The signature
-- changes (new return column), so a DROP IF EXISTS + CREATE is the safe
-- path — CREATE OR REPLACE would refuse the new return type.
DROP FUNCTION IF EXISTS public.failed_notifications_for_owner(integer, integer);

CREATE OR REPLACE FUNCTION public.failed_notifications_for_owner(
  p_max_age_hours integer DEFAULT 72,
  p_limit         integer DEFAULT 50
)
RETURNS TABLE (
  attempt_id        uuid,
  booking_id        bigint,
  channel           text,
  error_text        text,
  attempted_at      timestamptz,
  -- Frozen booking state at the moment the original delivery failed.
  -- The portal retry flow passes this back to notify-* as overrideStatus
  -- so the SMS the owner re-sends matches what they meant to send.
  intended_status   text,
  place_id          text,
  place_name        text,
  guest_name        text,
  guest_phone       text,
  booked_date       date,
  time_slot         text,
  booking_status    text,
  owner_notified_at timestamptz,
  guest_notified_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    na.id                AS attempt_id,
    na.booking_id,
    na.channel,
    na.error_text,
    na.attempted_at,
    na.intended_status,
    b.place_id,
    p.name               AS place_name,
    b.guest_name,
    b.guest_phone,
    b.booked_date,
    b.time_slot,
    b.status             AS booking_status,
    b.owner_notified_at,
    b.guest_notified_at
  FROM   public.notification_attempts na
  JOIN   public.bookings        b  ON b.id        = na.booking_id
  JOIN   public.business_owners bo ON bo.place_id = b.place_id
  LEFT  JOIN public.places      p  ON p.place_id  = b.place_id
  WHERE  bo.user_id      = auth.uid()
    AND  bo.claim_status = 'verified'
    AND  na.status       = 'error'
    AND  na.attempted_at > (now() - make_interval(hours => greatest(p_max_age_hours, 1)))
  ORDER  BY na.attempted_at DESC
  LIMIT  least(greatest(p_limit, 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.failed_notifications_for_owner(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.failed_notifications_for_owner(integer, integer) TO authenticated;
