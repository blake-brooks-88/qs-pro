-- Fix lifecycle cleanup worker permissions:
-- 1. Add RLS bypass policy for audit_logs retention purge (needs tenant_id only, not mid)
-- 2. Grant qs_runtime SELECT+DELETE on backoffice_audit_logs for retention purge

-- The existing audit_logs_tenant_isolation policy (0026) requires BOTH app.tenant_id
-- AND app.mid. The retention purge job iterates per-tenant and deletes across all MIDs,
-- so it cannot set app.mid. This policy allows DELETE when the retention purge flag is set.
CREATE POLICY "audit_logs_retention_purge"
  ON "audit_logs"
  FOR DELETE
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.audit_retention_purge', true) = 'on'
  );

-- Migration 0038 revoked ALL privileges on backoffice_audit_logs from qs_runtime.
-- The lifecycle cleanup worker (which runs as qs_runtime) needs to purge expired rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qs_runtime') THEN
    GRANT SELECT, DELETE ON "backoffice_audit_logs" TO qs_runtime;
  END IF;
END
$$;
