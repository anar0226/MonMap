-- Allow 'refund_failed' so cancel-booking can flag a payment whose automatic
-- QPay refund threw — making it queryable for manual follow-up instead of
-- silently leaving the row as 'paid'.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'paid'::text, 'failed'::text,
    'refunded'::text, 'refund_pending'::text, 'refund_failed'::text
  ]));
