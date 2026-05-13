-- Add optional deposit amount to places (opt-in per business owner)
-- NULL = no deposit required; a positive integer value in MNT enables the payment gate
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS deposit_amount integer;
