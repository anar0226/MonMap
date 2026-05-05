-- ============================================================
-- Places Table (reference data from OSM / Google Places)
-- ============================================================

create table places (
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

-- Index for map queries and geospatial searches
create index places_location_idx on places
  using gist(
    st_geogfromtext(format('POINT(%s %s)', lng, lat))
  );

-- Index for search/filter queries
create index places_category_idx on places(primary_category);
create index places_name_idx on places(name);
create index places_rating_idx on places(rating desc nulls last);
create index places_closure_idx on places(closure_report_count) where closure_report_count > 0;

-- Row level security: public read-only (unauthenticated)
alter table places enable row level security;
create policy "places: public read" on places for select using (true);

-- Service role can upsert
create policy "places: service role write" on places
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
