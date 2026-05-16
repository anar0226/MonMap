-- Audit trail columns for admin claim review workflow.
-- reviewed_by stores the admin's email for a human-readable audit log.
ALTER TABLE public.business_owners
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by     text;
