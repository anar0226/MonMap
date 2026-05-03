-- Portal: business_owners table links auth users to their place in the places table.
-- Also adds the UPDATE policy on bookings so owners can confirm/cancel.

create table if not exists public.business_owners (
  user_id    uuid not null references auth.users(id) on delete cascade,
  place_id   text not null references public.places(place_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

alter table public.business_owners enable row level security;

create policy "owners: read own"
  on public.business_owners for select
  using (auth.uid() = user_id);

create policy "owners: insert own"
  on public.business_owners for insert
  with check (auth.uid() = user_id);

-- Business owners may update booking status for places they have claimed
create policy "bookings: owner update"
  on public.bookings for update
  using (
    exists (
      select 1 from public.business_owners bo
      where bo.place_id = bookings.place_id
        and bo.user_id = auth.uid()
    )
  );
