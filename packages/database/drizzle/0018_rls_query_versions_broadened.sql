-- Custom SQL migration file, put your code below! --

DROP POLICY IF EXISTS "query_versions_user_isolation" ON "query_versions";
CREATE POLICY "query_versions_tenant_isolation"
  ON "query_versions"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid = current_setting('app.mid', true)
  );
