-- Fix: audit_logs_retention_purge policy must be FOR ALL, not FOR DELETE.
--
-- PostgreSQL AND-combines policies of different command types. The existing
-- audit_logs_tenant_isolation (FOR ALL) requires both app.tenant_id AND app.mid.
-- A FOR DELETE policy is AND-ed with FOR ALL, so the row is invisible to DELETE
-- unless app.mid is also set. The lifecycle cleanup service iterates per-tenant
-- (not per-MID), so it cannot set app.mid.
--
-- Changing to FOR ALL makes this an alternative visibility path: when the
-- audit_retention_purge flag is set, rows are visible for any operation
-- (SELECT/DELETE) without requiring app.mid.
-- The WITH CHECK (false) prevents INSERT/UPDATE through this policy path.

DROP POLICY IF EXISTS "audit_logs_retention_purge" ON "audit_logs";

CREATE POLICY "audit_logs_retention_purge"
  ON "audit_logs"
  FOR ALL
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.audit_retention_purge', true) = 'on'
  )
  WITH CHECK (false);
