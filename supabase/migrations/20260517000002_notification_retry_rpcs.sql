-- RPCs that power the portal's notification retry dashboard.
--
-- The notification_attempts table has no RLS policies — it's service-role-only
-- by design, so we never expose its raw rows. The portal needs a way to:
--
--   1. List failed deliveries for the signed-in owner's places.
--   2. Look up the corresponding booking so the UI can show context.
--
-- Both are exposed as SECURITY DEFINER functions that join through
-- business_owners and enforce the (auth.uid() = owner) check inside the
-- function body. This is the same pattern we use for portal_push_subscriptions.
--
-- The "retry" action itself is just a `supabase.functions.invoke('notify-booking',
-- { body: { bookingId } })` call from the portal client — the edge function
-- already verifies ownership for non-service-role callers, so we don't need
-- a separate retry RPC.

-- ── List failed notifications for the calling owner ──────────────────────────
CREATE OR REPLACE FUNCTION public.failed_notifications_for_owner(
  p_max_age_hours integer DEFAULT 72,
  p_limit         integer DEFAULT 50
)
RETURNS TABLE (
  attempt_id     uuid,
  booking_id     bigint,
  channel        text,
  error_text     text,
  attempted_at   timestamptz,
  place_id       text,
  place_name     text,
  guest_name     text,
  guest_phone    text,
  booked_date    date,
  time_slot      text,
  booking_status text,
  -- Latest delivery state from bookings — lets the UI hide rows that have
  -- since succeeded (e.g. a retry from another tab succeeded between page
  -- loads). We don't filter these out here so the UI can decide.
  owner_notified_at timestamptz,
  guest_notified_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The join chain enforces ownership: we only return attempts attached to
  -- bookings whose place is owned by auth.uid() with a verified claim.
  RETURN QUERY
  SELECT
    na.id                AS attempt_id,
    na.booking_id,
    na.channel,
    na.error_text,
    na.attempted_at,
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

-- ── Summary counts for the dashboard badge ───────────────────────────────────
-- Returns a single row with the count of failed deliveries in the last 24h
-- so the sidebar bell can render a meaningful number without paginating.
CREATE OR REPLACE FUNCTION public.failed_notifications_count_for_owner()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT count(*)::integer
  FROM   public.notification_attempts na
  JOIN   public.bookings        b  ON b.id        = na.booking_id
  JOIN   public.business_owners bo ON bo.place_id = b.place_id
  WHERE  bo.user_id      = auth.uid()
    AND  bo.claim_status = 'verified'
    AND  na.status       = 'error'
    AND  na.attempted_at > now() - interval '24 hours';
$$;

REVOKE ALL ON FUNCTION public.failed_notifications_count_for_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.failed_notifications_count_for_owner() TO authenticated;
