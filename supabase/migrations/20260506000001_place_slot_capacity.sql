alter table places
  add column if not exists slot_capacity smallint not null default 8;

comment on column places.slot_capacity is
  'Max concurrent bookings per 30-minute slot. Set per-place by admin; defaults to 8 until merchant onboarding exists.';
