-- Adds search_unclaimed_places(query) RPC so the registration claim search can
-- exclude already-owned businesses without exposing business_owners to public
-- reads. The underlying RLS on business_owners limits SELECT to the row owner,
-- so the plain PostgREST query path can never see foreign rows. A SECURITY
-- DEFINER function bypasses that restriction safely for the narrow purpose of
-- checking existence (not returning the sensitive row contents).
--
-- Granted to anon as well as authenticated so the register page can call it
-- before the user has completed OTP verification.

-- Index that makes the NOT EXISTS subquery fast. The primary key (user_id, place_id)
-- covers prefix lookups by user_id but not by place_id alone.
CREATE INDEX IF NOT EXISTS business_owners_place_id_idx
  ON public.business_owners (place_id);

CREATE OR REPLACE FUNCTION public.search_unclaimed_places(query text)
RETURNS TABLE(place_id text, name text, primary_category text, formatted_address text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.place_id, p.name, p.primary_category, p.formatted_address
  FROM public.places p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.business_owners bo WHERE bo.place_id = p.place_id
  )
  AND (
    p.name             ILIKE '%' || query || '%'
    OR p.formatted_address ILIKE '%' || query || '%'
  )
  ORDER BY p.rating DESC NULLS LAST
  LIMIT 15;
$$;

REVOKE ALL ON FUNCTION public.search_unclaimed_places(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_unclaimed_places(text) TO anon, authenticated;
