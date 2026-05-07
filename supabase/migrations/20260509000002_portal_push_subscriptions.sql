-- Portal Web Push subscriptions.
-- Each row represents a browser PushSubscription for one owner on one device.
-- The same owner may have multiple rows (phone + laptop + tablet each get their own endpoint).
-- Rows are pruned automatically when the push service returns 410 Gone.

CREATE TABLE IF NOT EXISTS public.portal_push_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id   text        NOT NULL REFERENCES public.places(place_id) ON DELETE CASCADE,
  endpoint   text        NOT NULL,
  p256dh     text        NOT NULL,   -- base64url client ECDH public key
  auth_key   text        NOT NULL,   -- base64url 16-byte auth secret
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(endpoint)
);

ALTER TABLE public.portal_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owners can read / upsert / delete only their own subscriptions.
CREATE POLICY "push_subs: owner select"
  ON public.portal_push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "push_subs: owner insert"
  ON public.portal_push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subs: owner update"
  ON public.portal_push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "push_subs: owner delete"
  ON public.portal_push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Index for the edge function: look up all subscriptions for a given place quickly.
CREATE INDEX IF NOT EXISTS portal_push_subs_place_idx
  ON public.portal_push_subscriptions (place_id);
