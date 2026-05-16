-- Adds booking_enabled to places so the mobile app only shows the booking tab
-- for places whose business owner has been verified by an admin.
-- Default false — no existing place can accept bookings until explicitly enabled.

alter table public.places
  add column if not exists booking_enabled boolean not null default false;

comment on column public.places.booking_enabled is
  'Set to true by admin when the corresponding business_owners row is verified. '
  'Controls whether the booking tab is shown in the mobile app.';
