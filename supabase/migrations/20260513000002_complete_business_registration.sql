-- Atomic registration RPC. The portal previously did:
--   1. signInWithOtp (creates auth user)
--   2. insert into places            -- can fail
--   3. upsert into business_owners   -- can fail
-- If steps 2 or 3 failed, the auth user was orphaned and the owner could not
-- recover. This RPC runs 2 + 3 in one transaction, server-side, after the
-- magic-link redirect lands the user signed-in.
--
-- SECURITY DEFINER lets the RPC bypass RLS only for this specific bundled
-- write. Because the function pulls auth.uid() itself, the caller cannot
-- impersonate another user.

create or replace function public.complete_business_registration(
  p_payload jsonb
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

  return v_place_id;
end;
$$;

revoke all on function public.complete_business_registration(jsonb) from public;
grant execute on function public.complete_business_registration(jsonb) to authenticated;
