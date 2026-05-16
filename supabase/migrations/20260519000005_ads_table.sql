-- Ads table for MonMap's self-served rewarded-ad gate.
-- Admins upload video files to the 'ads' Supabase Storage bucket.
-- fetch-rewarded-ad picks the current active ad and returns a signed URL +
-- HMAC verification token. record-bg-ad-view verifies the token before
-- stamping bg_ad_watched_at on the nav_trip row.

-- Storage bucket (private — clients never read directly; edge fn issues signed URLs).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ads', 'ads', false,
  104857600,                             -- 100 MB per file
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Metadata table for uploaded ad videos.
CREATE TABLE public.ads (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text        NOT NULL,
  storage_path     text        NOT NULL UNIQUE, -- relative path within the 'ads' bucket
  duration_seconds integer     NOT NULL CHECK (duration_seconds BETWEEN 5 AND 120),
  active           boolean     NOT NULL DEFAULT true,
  display_order    integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ads_active_order_idx ON public.ads (active, display_order)
  WHERE active = true;

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
-- No client policies — only service role reads/writes. Admins manage via dashboard.

CREATE TRIGGER ads_set_updated_at
  BEFORE UPDATE ON public.ads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
