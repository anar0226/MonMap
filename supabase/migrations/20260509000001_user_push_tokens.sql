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
CREATE POLICY "user_push_tokens_self"
  ON public.user_push_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role (edge functions) can read all tokens.
CREATE POLICY "user_push_tokens_service_read"
  ON public.user_push_tokens
  FOR SELECT
  USING (true);
