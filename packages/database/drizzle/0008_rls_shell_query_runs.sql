-- Custom SQL migration file, put your code below! --

-- Enable RLS on shell_query_runs
ALTER TABLE "shell_query_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shell_query_runs" FORCE ROW LEVEL SECURITY;

-- Strict per-user isolation (tenant + MID + user)
DROP POLICY IF EXISTS "shell_query_runs_user_isolation" ON "shell_query_runs";
CREATE POLICY "shell_query_runs_user_isolation"
  ON "shell_query_runs"
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
