-- Store one Expo push token per user, upserted on every app login.
-- Used by notify-guest edge function to send push notifications on booking confirmation.
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own token.
-- Service-role (edge functions) bypasses RLS automatically and so does NOT
-- need its own policy here — adding a permissive SELECT policy would leak
-- every Expo push token to the anon role, since `USING (true)` applies to
-- every connection that goes through PostgREST.
CREATE POLICY "user_push_tokens_self"
  ON public.user_push_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
