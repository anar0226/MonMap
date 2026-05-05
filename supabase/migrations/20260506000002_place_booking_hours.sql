-- Per-place booking hour overrides.
-- null = use Google Places opening hours (parsed from weekday_descriptions).
-- Set by the business owner via the portal.
alter table places
  add column if not exists booking_open_hour  smallint check (booking_open_hour  between 0 and 23),
  add column if not exists booking_close_hour smallint check (booking_close_hour between 1 and 24);
