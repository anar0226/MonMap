-- ============================================================
-- Mongolian structured address layer on places
-- ============================================================
-- Adds дүүрэг / хороо / хороолол / байр / хаалга / тоот columns
-- so we can search and render addresses the way UB actually navigates
-- (instead of relying on Google's free-text formatted_address).
--
-- All columns are nullable: existing rows are populated by the
-- backfill script (scripts/backfill-addresses.mjs) which parses
-- the existing formatted_address / short_address / name fields.

alter table places
  add column district           text,
  add column khoroo             smallint,
  add column khoroolol          text,
  add column building_number    text,
  add column entrance_number    smallint,
  add column unit_number        text,
  add column address_searchable text;

create index places_district_idx  on places(district);
create index places_khoroolol_idx on places(khoroolol);
create index places_building_idx  on places(building_number);
