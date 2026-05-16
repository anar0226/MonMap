-- Navigation trip + heartbeat tables backing the "earn while stuck in traffic"
-- feature. A trip is created when the user starts turn-by-turn driving nav,
-- accumulates per-minute earnings while heartbeats land on congested segments
-- of the cached route, and is finalised when nav stops.
--
-- All earnings logic is server-authoritative: the client only submits raw
-- location pings. nav-trip-heartbeat edge function validates speed / route
-- match / congestion / daily cap, and crediting goes through credit_wallet.

CREATE TABLE public.nav_trips (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at             timestamptz NOT NULL DEFAULT now(),
  ended_at               timestamptz,
  ended_reason           text CHECK (ended_reason IN (
                           'user_stopped',
                           'auto_stationary',
                           'auto_timeout',
                           'auto_arrived'
                         )),
  origin_lat             numeric(10, 8) NOT NULL,
  origin_lon             numeric(11, 8) NOT NULL,
  dest_lat               numeric(10, 8) NOT NULL,
  dest_lon               numeric(11, 8) NOT NULL,
  mode                   text NOT NULL DEFAULT 'driving' CHECK (mode IN ('driving','transit','walking','cycling','escooter')),

  -- Cached Mapbox route summary: { polyline, segments:[{coordIdxStart, coordIdxEnd, congestion}], distance, duration, durationTypical }
  -- Frozen at trip start to prevent the client from swapping in a more-congested route mid-trip.
  mapbox_route_summary   jsonb NOT NULL,
  congestion_refreshed_at timestamptz,

  bg_ad_watched_at       timestamptz,            -- last verified rewarded-ad SSV
  earned_seconds         integer NOT NULL DEFAULT 0,
  earned_mnt             integer NOT NULL DEFAULT 0,

  -- Last accepted heartbeat — used to clamp credit gap and detect stationary.
  last_accepted_at       timestamptz,
  last_lat               numeric(10, 8),
  last_lon               numeric(11, 8),

  -- Anchor for the 10-min stationary check. Updated whenever the user has
  -- moved ≥10 m from this anchor. If the anchor is older than 10 min and the
  -- user still hasn't moved 10 m, the trip auto-ends.
  stationary_anchor_at   timestamptz,
  stationary_anchor_lat  numeric(10, 8),
  stationary_anchor_lon  numeric(11, 8),

  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nav_trips_user_started_idx ON public.nav_trips (user_id, started_at DESC);

-- At most one open trip per user. ended_at IS NULL means active.
CREATE UNIQUE INDEX nav_trips_one_open_per_user
  ON public.nav_trips (user_id)
  WHERE ended_at IS NULL;

ALTER TABLE public.nav_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_trips_read_own"
  ON public.nav_trips FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Heartbeat audit trail. Every client ping lands here whether accepted or
-- rejected, so we can debug and audit. Indexed only by trip+time.
-- ---------------------------------------------------------------------------
CREATE TABLE public.nav_heartbeats (
  id            bigserial   PRIMARY KEY,
  trip_id       uuid        NOT NULL REFERENCES public.nav_trips(id) ON DELETE CASCADE,
  client_ts     timestamptz NOT NULL,
  server_ts     timestamptz NOT NULL DEFAULT now(),
  lat           numeric(10, 8) NOT NULL,
  lon           numeric(11, 8) NOT NULL,
  speed_mps     real,
  app_state     text NOT NULL CHECK (app_state IN ('foreground', 'background')),
  accepted      boolean NOT NULL,
  reject_reason text,
  credited_seconds integer NOT NULL DEFAULT 0
);

CREATE INDEX nav_heartbeats_trip_idx ON public.nav_heartbeats (trip_id, server_ts DESC);

ALTER TABLE public.nav_heartbeats ENABLE ROW LEVEL SECURITY;

-- Clients don't need to read heartbeats directly; service role only.

-- ---------------------------------------------------------------------------
-- Daily earnings counter. One row per (user, ymd in Asia/Ulaanbaatar TZ).
-- Caps earnings at 2,000 MNT/day.
-- ---------------------------------------------------------------------------
CREATE TABLE public.daily_earning_counters (
  user_id    uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ymd        date    NOT NULL,                       -- date in Asia/Ulaanbaatar
  earned_mnt integer NOT NULL DEFAULT 0 CHECK (earned_mnt >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ymd)
);

ALTER TABLE public.daily_earning_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_earning_counters_read_own"
  ON public.daily_earning_counters FOR SELECT
  USING (auth.uid() = user_id);

CREATE TRIGGER daily_earning_counters_set_updated_at
  BEFORE UPDATE ON public.daily_earning_counters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Constants — declared as immutable functions so edge functions and the RPCs
-- below stay in sync with a single source of truth.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.traffic_earning_rate_mnt_per_min()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 20 $$;

CREATE OR REPLACE FUNCTION public.traffic_earning_daily_cap_mnt()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 2000 $$;

CREATE OR REPLACE FUNCTION public.traffic_earning_withdraw_threshold_mnt()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 50000 $$;

-- ---------------------------------------------------------------------------
-- RPC: try_credit_traffic_minute
-- Called from nav-trip-heartbeat once a trip has accumulated a full 60s of
-- credited time. Atomically:
--   1. Reads the current daily counter for the user (Asia/Ulaanbaatar TZ).
--   2. Clamps the +20 MNT credit so user can't exceed the 2,000/day cap.
--   3. Increments daily counter, nav_trips.earned_mnt, calls credit_wallet.
-- Returns the integer MNT actually credited (0 if cap reached).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_credit_traffic_minute(
  p_trip_id  uuid,
  p_minute   integer        -- monotonic 1-based minute index within the trip
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid;
  v_rate      integer := public.traffic_earning_rate_mnt_per_min();
  v_cap       integer := public.traffic_earning_daily_cap_mnt();
  v_ymd       date    := (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date;
  v_today     integer;
  v_credit    integer;
BEGIN
  SELECT user_id INTO v_user
  FROM public.nav_trips
  WHERE id = p_trip_id
  FOR UPDATE;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'trip not found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency on (trip, minute) is enforced inside credit_wallet via the
  -- wallet_ledger unique index; we still need to gate the daily counter so
  -- we read it before deciding the credit amount.
  IF EXISTS (
    SELECT 1 FROM public.wallet_ledger
    WHERE user_id = v_user
      AND kind    = 'traffic_earning'
      AND ref_id  = p_trip_id
      AND (metadata->>'minute')::int = p_minute
  ) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.daily_earning_counters (user_id, ymd, earned_mnt)
  VALUES (v_user, v_ymd, 0)
  ON CONFLICT (user_id, ymd) DO NOTHING;

  SELECT earned_mnt INTO v_today
  FROM public.daily_earning_counters
  WHERE user_id = v_user AND ymd = v_ymd
  FOR UPDATE;

  v_credit := LEAST(v_rate, v_cap - v_today);
  IF v_credit <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.daily_earning_counters
  SET earned_mnt = earned_mnt + v_credit,
      updated_at = now()
  WHERE user_id = v_user AND ymd = v_ymd;

  UPDATE public.nav_trips
  SET earned_mnt = earned_mnt + v_credit
  WHERE id = p_trip_id;

  PERFORM public.credit_wallet(
    v_user,
    v_credit,
    'traffic_earning',
    p_trip_id,
    jsonb_build_object('minute', p_minute, 'ymd', v_ymd::text)
  );

  RETURN v_credit;
END;
$$;

REVOKE ALL ON FUNCTION public.try_credit_traffic_minute(uuid, integer) FROM PUBLIC;
