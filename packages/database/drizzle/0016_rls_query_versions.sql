-- Custom SQL migration file, put your code below! --

ALTER TABLE "query_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "query_versions" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "query_versions_user_isolation" ON "query_versions";
CREATE POLICY "query_versions_user_isolation"
  ON "query_versions"
  USING (
    "tenant_id"::text = current_setting('app.tenant_id', true)
    AND "mid"::text = current_setting('app.mid', true)
    AND "user_id"::text = current_setting('app.user_id', true)
  )
  WITH CHECK (
    "tenant_id"::text = current_setting('app.tenant_id', true)
    AND "mid"::text = current_setting('app.mid', true)
    AND "user_id"::text = current_setting('app.user_id', true)
  );
