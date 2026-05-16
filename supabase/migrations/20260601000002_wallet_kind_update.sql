-- Extend wallet_ledger.kind to include 'indoor_mapping' for mapper rewards.
-- Must alter the CHECK constraint; PostgreSQL requires dropping and re-adding it.

ALTER TABLE public.wallet_ledger
  DROP CONSTRAINT IF EXISTS wallet_ledger_kind_check;

ALTER TABLE public.wallet_ledger
  ADD CONSTRAINT wallet_ledger_kind_check CHECK (kind IN (
    'traffic_earning',
    'referral_bonus',
    'spend_booking',
    'payout',
    'reversal',
    'indoor_mapping'
  ));
