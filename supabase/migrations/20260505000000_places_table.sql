-- ============================================================
-- Places Table (reference data from OSM / Google Places)
-- ============================================================
-- The places table was consolidated into the initial schema
-- (20260501000000_initial_schema.sql) to resolve FK ordering against bookings
-- and business_owners. This migration is kept idempotent so any environment
-- that already applied an earlier ordering still ends up in the same state.

create table if not exists places (
  place_id               text primary key,
  name                   text not null,
  primary_category       text,
  lat                    numeric(10, 8) not null,
  lng                    numeric(11, 8) not null,
  formatted_address      text,
  short_address          text,
  phone_intl             text,
  phone_national         text,
  regular_opening_hours  jsonb,
  current_opening_hours  jsonb,
  rating                 numeric(3, 2),
  user_rating_count      integer,
  website_uri            text,
  business_status        text,
  closure_report_count   integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists places_location_idx on places
  using gist(st_geogfromtext(format('POINT(%s %s)', lng, lat)));
create index if not exists places_category_idx on places(primary_category);
create index if not exists places_name_idx     on places(name);
create index if not exists places_rating_idx   on places(rating desc nulls last);
create index if not exists places_closure_idx  on places(closure_report_count) where closure_report_count > 0;

alter table places enable row level security;

drop policy if exists "places: public read"        on places;
drop policy if exists "places: service role write" on places;

create policy "places: public read" on places for select using (true);
create policy "places: service role write" on places
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
