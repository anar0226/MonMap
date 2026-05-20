-- Admins (auth.users.user_metadata.is_admin = true) can manage every row in
-- public.ads. The previous policy was "no client access at all" so admins had
-- to use the Supabase dashboard; this lets the portal /admin.html manage ads
-- directly via PostgREST.
CREATE POLICY "admins read ads"
ON public.ads FOR SELECT
USING ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true);

CREATE POLICY "admins insert ads"
ON public.ads FOR INSERT
WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true);

CREATE POLICY "admins update ads"
ON public.ads FOR UPDATE
USING ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true)
WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true);

CREATE POLICY "admins delete ads"
ON public.ads FOR DELETE
USING ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true);

-- Storage policies for the 'ads' bucket — admins can upload, list, replace,
-- and delete video files. Non-admins still hit the existing service-role-only
-- access pattern via the fetch-rewarded-ad edge function.
CREATE POLICY "admins read ads bucket"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'ads'
  AND (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true
);

CREATE POLICY "admins write ads bucket"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ads'
  AND (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true
);

CREATE POLICY "admins update ads bucket"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'ads'
  AND (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true
);

CREATE POLICY "admins delete ads bucket"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'ads'
  AND (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true
);
