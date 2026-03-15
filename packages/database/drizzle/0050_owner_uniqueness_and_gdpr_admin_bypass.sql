-- (1) Resolve any pre-existing duplicate owners before adding the constraint.
-- Keeps the earliest-created owner per tenant, demotes the rest to 'admin'.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id
    FROM users
    WHERE role = 'owner'
      AND id NOT IN (
        SELECT DISTINCT ON (tenant_id) id
        FROM users
        WHERE role = 'owner'
        ORDER BY tenant_id, created_at ASC
      )
  LOOP
    UPDATE users SET role = 'admin' WHERE id = r.id;
  END LOOP;
END $$;

-- Enforce at-most-one owner per tenant.
-- Declarative: protects against any code path, not just assignOwnerIfNone.
CREATE UNIQUE INDEX IF NOT EXISTS users_one_owner_per_tenant
  ON users (tenant_id)
  WHERE role = 'owner';

-- (2) Admin bypass policies for GDPR cross-BU user deletion.
-- These allow the deletion service to operate across ALL BUs in a single
-- transaction when app.admin_action = 'true'. Scoped by tenant_id only
-- (no mid requirement), unlike the folders_admin_bypass which retains mid scoping.
--
-- PostgreSQL OR-combines same-command-type policies, so these augment
-- (not replace) the existing per-BU isolation policies.

CREATE POLICY "credentials_admin_bypass"
  ON "credentials"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  );

CREATE POLICY "saved_queries_admin_bypass"
  ON "saved_queries"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  );

CREATE POLICY "query_versions_admin_bypass"
  ON "query_versions"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  );

CREATE POLICY "query_publish_events_admin_bypass"
  ON "query_publish_events"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  );

CREATE POLICY "shell_query_runs_admin_bypass"
  ON "shell_query_runs"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND current_setting('app.admin_action', true) = 'true'
  );
