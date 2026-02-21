-- Custom SQL migration file, put your code below! --

-- Update folders RLS: personal folders = user-scoped, shared folders = BU-scoped
-- This replaces the original "folders_user_isolation" policy from migration 0011
DROP POLICY IF EXISTS "folders_user_isolation" ON "folders";
CREATE POLICY "folders_visibility_policy"
  ON "folders"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid = current_setting('app.mid', true)
    AND (
      visibility = 'shared'
      OR user_id::text = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid = current_setting('app.mid', true)
    AND (
      visibility = 'shared'
      OR user_id::text = current_setting('app.user_id', true)
    )
  );
