-- Wallet ledger for traffic earnings + referral bonuses.
-- All monetary amounts are integer MNT (no decimals), matching payments.amount.
--
-- Two tables:
--   wallet_balances : one row per user, materialised running totals.
--   wallet_ledger   : append-only audit trail; every balance change writes a row.
--
-- Balances are mutated only through credit_wallet/debit_wallet SECURITY DEFINER
-- RPCs so RLS can stay strict (owner-read, no direct writes from clients).

CREATE TABLE public.wallet_balances (
  user_id              uuid    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  available_mnt        integer NOT NULL DEFAULT 0 CHECK (available_mnt >= 0),
  pending_mnt          integer NOT NULL DEFAULT 0 CHECK (pending_mnt   >= 0),
  lifetime_earned_mnt  integer NOT NULL DEFAULT 0 CHECK (lifetime_earned_mnt >= 0),
  kyc_verified         boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_balances_read_own"
  ON public.wallet_balances FOR SELECT
  USING (auth.uid() = user_id);

CREATE TRIGGER wallet_balances_set_updated_at
  BEFORE UPDATE ON public.wallet_balances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only ledger. `ref_id` points at the originating row (nav_trips.id,
-- referrals.id, bookings.id, …). `kind` discriminates so a single ref_id can
-- be reused across kinds without collision.
CREATE TABLE public.wallet_ledger (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta_mnt   integer     NOT NULL,                 -- signed; + = credit, - = debit
  kind        text        NOT NULL CHECK (kind IN (
                'traffic_earning',
                'referral_bonus',
                'spend_booking',
                'payout',
                'reversal'
              )),
  ref_id      uuid,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wallet_ledger_user_created_idx
  ON public.wallet_ledger (user_id, created_at DESC);

-- Idempotency: at most one ledger row per (user, kind, ref_id, metadata->>'minute').
-- The minute key matters for traffic_earning where we credit once per minute of a trip.
CREATE UNIQUE INDEX wallet_ledger_idempotency_idx
  ON public.wallet_ledger (
    user_id, kind, ref_id, COALESCE((metadata->>'minute')::int, -1)
  )
  WHERE ref_id IS NOT NULL;

ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_ledger_read_own"
  ON public.wallet_ledger FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RPC: credit_wallet
-- Adds delta_mnt to user's available_mnt and writes a ledger row.
-- Idempotent on (user, kind, ref_id, metadata.minute): re-running returns the
-- existing ledger row without double-crediting.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id   uuid,
  p_delta     integer,
  p_kind      text,
  p_ref_id    uuid,
  p_metadata  jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minute  integer := COALESCE((p_metadata->>'minute')::int, -1);
  v_id      uuid;
BEGIN
  IF p_delta <= 0 THEN
    RAISE EXCEPTION 'credit must be positive' USING ERRCODE = '22023';
  END IF;

  -- Idempotency probe.
  IF p_ref_id IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.wallet_ledger
    WHERE user_id = p_user_id
      AND kind    = p_kind
      AND ref_id  = p_ref_id
      AND COALESCE((metadata->>'minute')::int, -1) = v_minute;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.wallet_balances (user_id, available_mnt, lifetime_earned_mnt)
  VALUES (p_user_id, p_delta, p_delta)
  ON CONFLICT (user_id) DO UPDATE
    SET available_mnt        = wallet_balances.available_mnt       + p_delta,
        lifetime_earned_mnt  = wallet_balances.lifetime_earned_mnt + p_delta,
        updated_at           = now();

  INSERT INTO public.wallet_ledger (user_id, delta_mnt, kind, ref_id, metadata)
  VALUES (p_user_id, p_delta, p_kind, p_ref_id, p_metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_wallet(uuid, integer, text, uuid, jsonb) FROM PUBLIC;
-- Service role only; never called directly from clients.

-- ---------------------------------------------------------------------------
-- RPC: debit_wallet
-- Subtracts up to p_max_delta from available_mnt. Returns the actual amount
-- debited (may be less than requested if balance < max). Used by the booking
-- credit flow.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_user_id   uuid,
  p_max_delta integer,
  p_kind      text,
  p_ref_id    uuid,
  p_metadata  jsonb DEFAULT '{}'::jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance  integer;
  v_take     integer;
BEGIN
  IF p_max_delta <= 0 THEN
    RETURN 0;
  END IF;

  SELECT available_mnt INTO v_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance <= 0 THEN
    RETURN 0;
  END IF;

  v_take := LEAST(v_balance, p_max_delta);

  UPDATE public.wallet_balances
  SET available_mnt = available_mnt - v_take,
      updated_at    = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.wallet_ledger (user_id, delta_mnt, kind, ref_id, metadata)
  VALUES (p_user_id, -v_take, p_kind, p_ref_id, p_metadata);

  RETURN v_take;
END;
$$;

REVOKE ALL ON FUNCTION public.debit_wallet(uuid, integer, text, uuid, jsonb) FROM PUBLIC;
