-- Idempotency key for create-payment-intent.
-- A client-generated UUID is sent with each payment-intent request; on retry
-- (network timeout, app-side retry) the edge function looks up the row by
-- (user_id, idempotency_key) and returns the cached payment instead of
-- creating a duplicate slot hold + QPay invoice.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_user_key_idx
  ON public.payments (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
