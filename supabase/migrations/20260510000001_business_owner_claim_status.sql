-- Adds claim_status to business_owners to close the takeover hole where any
-- authenticated user could insert (user_id, place_id) for a place they don't own
-- and immediately gain owner write privileges over its bookings/profile.
--
-- Two paths through registration land in business_owners:
--   1. CREATE PATH — owner registers a brand-new place with id 'owner_<auth.uid()>'.
--      The owner is the only data source, so we auto-verify.
--   2. CLAIM PATH — owner claims an existing Google-imported place.
--      Anyone could submit this. Stays 'pending' until an admin (service-role
--      via Supabase Studio) flips claim_status to 'verified'.
--
-- The bookings/places owner-update policies now require claim_status='verified',
-- so a pending row gets read-only access (the dashboard's existing pending
-- banner already handles the UX).

-- 1. Column + check constraint
alter table public.business_owners
  add column if not exists claim_status text not null default 'pending';

alter table public.business_owners
  drop constraint if exists business_owners_claim_status_check;
alter table public.business_owners
  add  constraint business_owners_claim_status_check
       check (claim_status in ('pending', 'verified', 'rejected'));

-- 2. BEFORE-INSERT trigger forces the correct claim_status from the place_id
--    pattern. Defined SECURITY DEFINER so a malicious client can't override it
--    by passing an explicit claim_status='verified' on insert.
create or replace function public.set_business_owner_claim_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.place_id = 'owner_' || new.user_id::text then
    new.claim_status := 'verified';
  else
    new.claim_status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_business_owner_claim_status on public.business_owners;
create trigger trg_set_business_owner_claim_status
before insert on public.business_owners
for each row
execute function public.set_business_owner_claim_status();

-- 3. Tighten the bookings owner-update policy: only verified owners can
--    confirm / cancel. Pending claims read but cannot mutate.
drop policy if exists "bookings: owner update" on public.bookings;
create policy "bookings: owner update"
  on public.bookings for update
  using (
    exists (
      select 1 from public.business_owners bo
      where bo.place_id     = bookings.place_id
        and bo.user_id      = auth.uid()
        and bo.claim_status = 'verified'
    )
  );

-- 4. Same for the places owner-update policy: a pending claim cannot edit the
--    business profile, hours, etc.
drop policy if exists "places: owner update" on public.places;
create policy "places: owner update"
  on public.places for update
  using (
    exists (
      select 1 from public.business_owners bo
      where bo.place_id     = places.place_id
        and bo.user_id      = auth.uid()
        and bo.claim_status = 'verified'
    )
  );

-- No UPDATE policy on business_owners exists, so users cannot self-promote
-- claim_status; only the service role (admin) can mark a row verified.
