-- Track who initiated a booking cancellation so the UI can distinguish
-- "customer cancelled" from "owner cancelled" in the bookings list.
-- Three valid values:
--   customer — the booking user (mobile app, cancelled their own booking)
--   business — the venue owner (portal, cancelled the booking from their side)
--   system   — automated cancellation (e.g. unpaid hold expired)
-- NULL means the column is unset (historical rows or unknown source).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by text
  CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer','business','system'));

-- New places now default to slot_capacity=1 so each time slot is a single
-- appointment by default. Per-service capacity (services.max_capacity) is
-- the real source of truth when the booker has selected a service; the
-- place-level value only matters for venues without configured services.
ALTER TABLE places ALTER COLUMN slot_capacity SET DEFAULT 1;
