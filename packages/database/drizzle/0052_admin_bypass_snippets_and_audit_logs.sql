-- Admin bypass policies for GDPR operations on snippets and audit_logs.
-- Follows the same pattern as 0050_owner_uniqueness_and_gdpr_admin_bypass.sql.

CREATE POLICY "snippets_admin_bypass"
  ON "snippets"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  );

CREATE POLICY "audit_logs_admin_bypass"
  ON "audit_logs"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  );
