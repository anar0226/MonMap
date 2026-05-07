-- Adds first-class columns for the per-booking metadata that the portal was
-- jamming into guest_name. _mapBooking previously hardcoded duration: 60
-- because the column did not exist.
alter table bookings
  add column if not exists service          text,
  add column if not exists duration_minutes integer,
  add column if not exists note             text;

comment on column bookings.service is
  'Free-text service name (portal: salon haircut, restaurant table, etc).';
comment on column bookings.duration_minutes is
  'Booking length in minutes. NULL means use place.slot_duration_minutes.';
comment on column bookings.note is
  'Owner-entered note. Not surfaced to the guest.';
