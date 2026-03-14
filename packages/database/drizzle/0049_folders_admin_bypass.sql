-- Allow GDPR admin operations (user deletion content migration) to access
-- any folder within the tenant + MID scope, bypassing the user_id check.
--
-- PostgreSQL OR-combines same-command-type policies, so this augments
-- the existing "folders_visibility_policy" from migration 0030.
-- When app.admin_action = 'true', both USING and WITH CHECK pass for
-- any folder in the tenant+MID scope regardless of user_id.

CREATE POLICY "folders_admin_bypass"
  ON "folders"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid = current_setting('app.mid', true)
    AND current_setting('app.admin_action', true) = 'true'
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid = current_setting('app.mid', true)
    AND current_setting('app.admin_action', true) = 'true'
  );
