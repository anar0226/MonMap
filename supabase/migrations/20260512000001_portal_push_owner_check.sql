-- ============================================================
-- C-4  Portal push subscriptions must verify business ownership.
-- ============================================================
-- The previous WITH CHECK clause only verified the inserter was
-- subscribing themselves (auth.uid() = user_id), not that they
-- actually owned the place. Any authenticated user could subscribe
-- to any place_id and receive booking notifications containing guest
-- PII (name, date, time, party size) via web-push-notify.
--
-- Tighten insert/update so only verified business owners of that
-- place may register a subscription.
-- ============================================================

-- 1. Purge any rows inserted under the old, broken policy that don't
--    satisfy the new ownership predicate. Those are the leaks.
DELETE FROM public.portal_push_subscriptions pps
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_owners bo
  WHERE bo.place_id     = pps.place_id
    AND bo.user_id      = pps.user_id
    AND bo.claim_status = 'verified'
);

-- 2. Replace the insert policy with an ownership-verifying check.
DROP POLICY IF EXISTS "push_subs: owner insert" ON public.portal_push_subscriptions;
CREATE POLICY "push_subs: owner insert"
  ON public.portal_push_subscriptions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.business_owners bo
      WHERE bo.place_id     = portal_push_subscriptions.place_id
        AND bo.user_id      = auth.uid()
        AND bo.claim_status = 'verified'
    )
  );

-- 3. Same predicate on UPDATE so an owner can't repoint an existing
--    row to a place_id they no longer own (e.g. claim_status flipped
--    back to 'rejected' by an admin).
DROP POLICY IF EXISTS "push_subs: owner update" ON public.portal_push_subscriptions;
CREATE POLICY "push_subs: owner update"
  ON public.portal_push_subscriptions FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.business_owners bo
      WHERE bo.place_id     = portal_push_subscriptions.place_id
        AND bo.user_id      = auth.uid()
        AND bo.claim_status = 'verified'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.business_owners bo
      WHERE bo.place_id     = portal_push_subscriptions.place_id
        AND bo.user_id      = auth.uid()
        AND bo.claim_status = 'verified'
    )
  );

-- SELECT and DELETE policies are unchanged: an owner reads/deletes
-- their own subscription rows. Read-yourself is safe; only the leak
-- vector was the unrestricted insert.
