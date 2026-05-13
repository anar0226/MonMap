-- Aggregate customer list for the portal's customers.html page.
--
-- Pulling raw bookings (getBookings) silently capped at 1000 rows (Supabase
-- max_rows) ordered by booked_date ASC, so once a place crossed ~1000
-- lifetime bookings the page showed only the *oldest* rows and recent
-- customers vanished from the list. The aggregation is already done
-- client-side in buildCustomers(); doing it server-side returns one row per
-- customer (typically far fewer than 1000) and is bounded by p_limit.
--
-- SECURITY DEFINER so the function can scan bookings without giving the
-- portal user broad bookings SELECT permission. Authorisation is enforced
-- inline against business_owners (claim_status='verified') — only the
-- verified owner of the place may aggregate its customer data.

CREATE OR REPLACE FUNCTION public.get_place_customers(
  p_place_id text,
  p_limit    integer DEFAULT 1000,
  p_offset   integer DEFAULT 0
) RETURNS TABLE (
  customer_key text,
  name         text,
  phone        text,
  visits       integer,
  first_date   date,
  last_date    date,
  top_service  text,
  services     jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_owners bo
    WHERE bo.place_id     = p_place_id
      AND bo.user_id      = auth.uid()
      AND bo.claim_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'not authorised for this place'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH norm AS (
    SELECT
      -- Match the client's keying: prefer phone, fall back to name.
      -- NULL/empty phones with no name are dropped (no stable identity).
      COALESCE(NULLIF(b.guest_phone, ''), NULLIF(b.guest_name, '')) AS k,
      COALESCE(NULLIF(b.guest_name, ''),  'Харилцагч')              AS n,
      NULLIF(b.guest_phone, '')                                     AS p,
      b.booked_date                                                 AS d,
      COALESCE(NULLIF(b.service, ''), '—')                          AS s
    FROM public.bookings b
    WHERE b.place_id = p_place_id
      AND b.status <> 'cancelled'
  ),
  per_service AS (
    SELECT k, s, count(*)::int AS c
    FROM norm
    WHERE k IS NOT NULL
    GROUP BY k, s
  ),
  top_per_customer AS (
    SELECT DISTINCT ON (k) k, s AS top_s
    FROM per_service
    ORDER BY k, c DESC, s
  ),
  svc_map AS (
    SELECT k, jsonb_object_agg(s, c) AS svc_json
    FROM per_service
    GROUP BY k
  ),
  agg AS (
    SELECT
      n.k                       AS customer_key,
      max(n.n)                  AS name,
      max(n.p)                  AS phone,
      count(*)::int             AS visits,
      min(n.d)                  AS first_date,
      max(n.d)                  AS last_date
    FROM norm n
    WHERE n.k IS NOT NULL
    GROUP BY n.k
  )
  SELECT
    a.customer_key,
    a.name,
    a.phone,
    a.visits,
    a.first_date,
    a.last_date,
    t.top_s,
    m.svc_json
  FROM agg a
  LEFT JOIN top_per_customer t ON t.k = a.customer_key
  LEFT JOIN svc_map          m ON m.k = a.customer_key
  ORDER BY a.last_date DESC, a.customer_key
  LIMIT  GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_place_customers(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_place_customers(text, integer, integer) TO authenticated;
