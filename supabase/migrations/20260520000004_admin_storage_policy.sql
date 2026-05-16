-- Allow admin users to read any file in the verification-docs bucket so the
-- admin portal can generate signed URLs for claim review.
-- Admins are identified by is_admin=true in raw_user_meta_data, which Supabase
-- surfaces in the JWT under the 'user_metadata' claim.
CREATE POLICY "admins_read_all_verification" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'verification-docs'
    AND (auth.jwt() -> 'user_metadata' ->> 'is_admin') = 'true'
  );
