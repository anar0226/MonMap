-- Prevents a second user from claiming a place that already has any owner.
-- The previous version used ON CONFLICT (user_id, place_id) DO NOTHING which
-- only blocked the *same* user re-claiming; a different user could silently
-- create a second business_owners row for the same place.
--
-- The fix: on the CLAIM PATH only, check for any existing row with the
-- requested place_id before inserting and raise place_already_claimed if found.
-- The CREATE PATH (place_id = 'owner_<uid>') is unaffected — each new place
-- gets a unique id derived from the user's uid so duplicates are impossible.

CREATE OR REPLACE FUNCTION public.complete_business_registration(
  p_payload   jsonb,
  p_doc_paths jsonb DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_place_id text;
  v_lat      double precision;
  v_lng      double precision;
  v_claim    text;
  v_doc      jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_claim := p_payload->>'claimPlaceId';

  IF v_claim IS NOT NULL AND length(v_claim) > 0 THEN
    -- ── CLAIM PATH ──
    v_place_id := v_claim;

    -- Reject if any user already owns this place (regardless of claim_status).
    IF EXISTS (
      SELECT 1 FROM business_owners WHERE place_id = v_place_id
    ) THEN
      RAISE EXCEPTION 'place_already_claimed';
    END IF;

  ELSE
    -- ── CREATE PATH ──
    v_place_id := 'owner_' || v_user_id::text;
    v_lat := (p_payload->>'lat')::double precision;
    v_lng := (p_payload->>'lng')::double precision;

    INSERT INTO places (
      place_id, name, primary_category, types,
      location, lat, lng,
      formatted_address, short_address, phone_national,
      slot_capacity,
      regular_opening_hours, booking_open_hour, booking_close_hour,
      business_status, raw,
      fetched_at, updated_at
    ) VALUES (
      v_place_id,
      p_payload->>'name',
      p_payload->>'category',
      array[p_payload->>'category'],
      ('SRID=4326;POINT(' || v_lng || ' ' || v_lat || ')')::geography,
      v_lat, v_lng,
      p_payload->>'formatted_address',
      p_payload->>'short_address',
      p_payload->>'phone_national',
      COALESCE((p_payload->>'slot_capacity')::int, 1),
      p_payload->'regular_opening_hours',
      nullif(p_payload->>'booking_open_hour', '')::int,
      nullif(p_payload->>'booking_close_hour', '')::int,
      'OPERATIONAL',
      p_payload->'raw',
      now(), now()
    )
    ON CONFLICT (place_id) DO NOTHING;
  END IF;

  INSERT INTO business_owners (user_id, place_id)
  VALUES (v_user_id, v_place_id)
  ON CONFLICT (user_id, place_id) DO NOTHING;

  -- Insert verification documents if provided (claim path only).
  IF p_doc_paths IS NOT NULL AND jsonb_array_length(p_doc_paths) > 0 THEN
    FOR v_doc IN SELECT * FROM jsonb_array_elements(p_doc_paths)
    LOOP
      INSERT INTO verification_documents (place_id, user_id, doc_type, storage_path)
      VALUES (
        v_place_id,
        v_user_id,
        COALESCE(v_doc->>'doc_type', 'other'),
        v_doc->>'storage_path'
      );
    END LOOP;
  END IF;

  RETURN v_place_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_business_registration(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_business_registration(jsonb, jsonb) TO authenticated;
