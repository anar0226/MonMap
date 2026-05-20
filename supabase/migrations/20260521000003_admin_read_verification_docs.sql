CREATE POLICY "admins read all verification docs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'verification-docs'
  AND (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true
);
