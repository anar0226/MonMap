-- Payment records for QPay deposit bookings.
-- A payment row is created by create-payment-intent and confirmed by payment-webhook.
-- The booking row is only created after a payment reaches status='paid'.

-- Inline-define the updated_at trigger function. The initial-schema migration
-- also declares this, but the remote DB drifted at some point so we ensure
-- it exists here too. CREATE OR REPLACE is idempotent — running twice is a
-- no-op.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE public.payments (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        bigint  REFERENCES public.bookings(id) ON DELETE SET NULL,
  hold_id           uuid    REFERENCES public.slot_holds(id) ON DELETE SET NULL,
  place_id          text    NOT NULL REFERENCES public.places(place_id),
  user_id           uuid    REFERENCES auth.users(id) ON DELETE SET NULL,

  amount            integer NOT NULL,          -- MNT, integer (no decimal)
  currency          text    NOT NULL DEFAULT 'MNT',

  -- QPay invoice data (stored so we can refund or audit later)
  qpay_invoice_id   text    UNIQUE,
  qpay_qr_image     text,                      -- base64 PNG returned by QPay
  qpay_urls         jsonb,                     -- [{name, logo, link}] per bank app

  status            text    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','failed','refunded','refund_pending')),

  paid_at           timestamptz,
  refunded_at       timestamptz,
  refund_reason     text,
  webhook_payload   jsonb,                     -- raw QPay webhook body for audit

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payments_qpay_invoice_idx ON public.payments (qpay_invoice_id)
  WHERE qpay_invoice_id IS NOT NULL;

CREATE INDEX payments_hold_idx ON public.payments (hold_id, status);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users can read their own payment records
CREATE POLICY "payments_read_own"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id);

-- Trigger to keep updated_at current
CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Add payment reference columns to bookings.
-- payment_id stays uuid because payments.id is uuid (gen_random_uuid).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_id     uuid    REFERENCES public.payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deposit_amount integer; -- snapshot of the amount charged at booking time

-- Extend the status constraint to reserve 'awaiting_payment' for future use
-- (booking rows are not created with this status yet; it's reserved)
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'confirmed'::text,
    'cancelled'::text,
    'expired'::text,
    'awaiting_payment'::text
  ]));
