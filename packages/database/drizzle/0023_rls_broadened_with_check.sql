-- Custom SQL migration file, put your code below! --

-- Add explicit WITH CHECK clauses to broadened RLS policies on
-- query_versions (from 0018) and saved_queries (from 0019).
-- FORCE ROW LEVEL SECURITY was already set by prior migrations (0016, 0011).

DROP POLICY IF EXISTS "query_versions_tenant_isolation" ON "query_versions";
CREATE POLICY "query_versions_tenant_isolation"
  ON "query_versions"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid = current_setting('app.mid', true)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid = current_setting('app.mid', true)
  );

DROP POLICY IF EXISTS "saved_queries_tenant_isolation" ON "saved_queries";
CREATE POLICY "saved_queries_tenant_isolation"
  ON "saved_queries"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid = current_setting('app.mid', true)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid = current_setting('app.mid', true)
  );