-- Extends complete_business_registration to accept an optional doc_paths array
-- so the portal can atomically record verification document uploads alongside
-- the claim. The second parameter defaults to NULL so existing call-sites that
-- don't pass docs continue to work unchanged.
--
-- For safety: if any doc insert fails the whole transaction rolls back, so
-- there are no orphaned business_owners rows without their documents.

create or replace function public.complete_business_registration(
  p_payload   jsonb,
  p_doc_paths jsonb DEFAULT NULL   -- array of {storage_path, doc_type} objects
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id  uuid := auth.uid();
  v_place_id text;
  v_lat      double precision;
  v_lng      double precision;
  v_claim    text;
  v_doc      jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  v_claim := p_payload->>'claimPlaceId';

  if v_claim is not null and length(v_claim) > 0 then
    -- ── CLAIM PATH ──
    v_place_id := v_claim;
  else
    -- ── CREATE PATH ──
    v_place_id := 'owner_' || v_user_id::text;
    v_lat := (p_payload->>'lat')::double precision;
    v_lng := (p_payload->>'lng')::double precision;

    insert into places (
      place_id, name, primary_category, types,
      location, lat, lng,
      formatted_address, short_address, phone_national,
      slot_capacity,
      regular_opening_hours, booking_open_hour, booking_close_hour,
      business_status, raw,
      fetched_at, updated_at
    ) values (
      v_place_id,
      p_payload->>'name',
      p_payload->>'category',
      array[p_payload->>'category'],
      ('SRID=4326;POINT(' || v_lng || ' ' || v_lat || ')')::geography,
      v_lat, v_lng,
      p_payload->>'formatted_address',
      p_payload->>'short_address',
      p_payload->>'phone_national',
      coalesce((p_payload->>'slot_capacity')::int, 1),
      p_payload->'regular_opening_hours',
      nullif(p_payload->>'booking_open_hour','')::int,
      nullif(p_payload->>'booking_close_hour','')::int,
      'OPERATIONAL',
      p_payload->'raw',
      now(), now()
    )
    on conflict (place_id) do nothing;
  end if;

  insert into business_owners (user_id, place_id)
  values (v_user_id, v_place_id)
  on conflict (user_id, place_id) do nothing;

  -- Insert verification documents if provided (claim path only).
  if p_doc_paths is not null and jsonb_array_length(p_doc_paths) > 0 then
    for v_doc in select * from jsonb_array_elements(p_doc_paths)
    loop
      insert into verification_documents (place_id, user_id, doc_type, storage_path)
      values (
        v_place_id,
        v_user_id,
        coalesce(v_doc->>'doc_type', 'other'),
        v_doc->>'storage_path'
      );
    end loop;
  end if;

  return v_place_id;
end;
$$;

revoke all on function public.complete_business_registration(jsonb, jsonb) from public;
grant execute on function public.complete_business_registration(jsonb, jsonb) to authenticated;
