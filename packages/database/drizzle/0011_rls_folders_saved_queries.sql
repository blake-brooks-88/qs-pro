-- Custom SQL migration file, put your code below! --

-- Enable RLS on folders
ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "folders" FORCE ROW LEVEL SECURITY;

-- folders: tenant + MID + user isolation
DROP POLICY IF EXISTS "folders_user_isolation" ON "folders";
CREATE POLICY "folders_user_isolation"
  ON "folders"
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

-- Enable RLS on saved_queries
ALTER TABLE "saved_queries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_queries" FORCE ROW LEVEL SECURITY;

-- saved_queries: tenant + MID + user isolation
DROP POLICY IF EXISTS "saved_queries_user_isolation" ON "saved_queries";
CREATE POLICY "saved_queries_user_isolation"
  ON "saved_queries"
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
