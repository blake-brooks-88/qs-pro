-- Broaden saved_queries RLS from per-user to per-BU (tenant_id + mid).
--
-- Context: Query linking requires tenant-wide visibility so that any user
-- in the BU can discover which Query Activities are already linked to
-- another user's saved query (one-to-one enforcement). The previous
-- policy required user_id which caused findAllLinkedQaKeys to return
-- empty results under runWithTenantContext.

DROP POLICY IF EXISTS "saved_queries_user_isolation" ON "saved_queries";
CREATE POLICY "saved_queries_tenant_isolation"
  ON "saved_queries"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid = current_setting('app.mid', true)
  );
