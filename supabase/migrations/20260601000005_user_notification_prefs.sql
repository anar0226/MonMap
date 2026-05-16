-- Per-user notification preferences synced across devices.
-- Survives reinstalls; the client's AsyncStorage cache is only an offline
-- fast-path — Supabase is the source of truth.
CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled     boolean     NOT NULL DEFAULT true,
  promo_enabled    boolean     NOT NULL DEFAULT true,
  booking_enabled  boolean     NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;

-- Users can read/write only their own row. Service-role (edge functions
-- that send notifications) bypasses RLS automatically and reads the table
-- to decide which channels to deliver on — it does NOT need a permissive
-- SELECT policy here, which would otherwise leak prefs to the anon role.
CREATE POLICY "user_notification_prefs_self"
  ON public.user_notification_prefs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
