-- Storage bucket for business ownership verification documents.
-- Private (not public) — documents are signed-URL only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-docs',
  'verification-docs',
  false,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Owners may upload to their own folder ({user_id}/{filename}).
-- The service role bypasses RLS so edge functions can read all docs.
CREATE POLICY "owners_upload_verification" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'verification-docs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "owners_read_verification" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'verification-docs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Table tracking which documents were submitted for each claim.
CREATE TABLE public.verification_documents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id     text        NOT NULL REFERENCES public.places(place_id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type     text        NOT NULL CHECK (doc_type IN (
                 'registration_certificate',
                 'storefront_photo',
                 'lease_agreement',
                 'other'
               )),
  storage_path text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;

-- Owners can read their own submitted documents.
CREATE POLICY "owners_read_own_docs" ON public.verification_documents
  FOR SELECT USING (auth.uid() = user_id);
