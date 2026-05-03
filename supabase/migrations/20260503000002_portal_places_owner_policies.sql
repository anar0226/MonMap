-- Portal: allow business owners to create and edit their place row.
-- Owner-created places use a "owner_*" prefix to namespace them away from Google place_ids.

create policy "places: owner insert"
  on public.places for insert
  with check (
    auth.uid() is not null
    and place_id like 'owner\_%' escape '\'
  );

create policy "places: owner update"
  on public.places for update
  using (
    exists (
      select 1 from public.business_owners bo
      where bo.place_id = places.place_id
        and bo.user_id  = auth.uid()
    )
  );
