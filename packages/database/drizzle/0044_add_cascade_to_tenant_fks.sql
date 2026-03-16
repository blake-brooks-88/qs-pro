-- Add ON DELETE CASCADE to all tenant-referencing FKs that currently lack it

ALTER TABLE tenant_feature_overrides
  DROP CONSTRAINT IF EXISTS tenant_feature_overrides_tenant_id_tenants_id_fk,
  ADD CONSTRAINT tenant_feature_overrides_tenant_id_tenants_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_tenant_id_tenants_id_fk,
  ADD CONSTRAINT users_tenant_id_tenants_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE credentials
  DROP CONSTRAINT IF EXISTS credentials_tenant_id_tenants_id_fk,
  ADD CONSTRAINT credentials_tenant_id_tenants_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE snippets
  DROP CONSTRAINT IF EXISTS snippets_tenant_id_tenants_id_fk,
  ADD CONSTRAINT snippets_tenant_id_tenants_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE shell_query_runs
  DROP CONSTRAINT IF EXISTS shell_query_runs_tenant_id_tenants_id_fk,
  ADD CONSTRAINT shell_query_runs_tenant_id_tenants_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE tenant_settings
  DROP CONSTRAINT IF EXISTS tenant_settings_tenant_id_tenants_id_fk,
  ADD CONSTRAINT tenant_settings_tenant_id_tenants_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE folders
  DROP CONSTRAINT IF EXISTS folders_tenant_id_tenants_id_fk,
  ADD CONSTRAINT folders_tenant_id_tenants_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE saved_queries
  DROP CONSTRAINT IF EXISTS saved_queries_tenant_id_tenants_id_fk,
  ADD CONSTRAINT saved_queries_tenant_id_tenants_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE query_versions
  DROP CONSTRAINT IF EXISTS query_versions_tenant_id_fkey,
  ADD CONSTRAINT query_versions_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE query_publish_events
  DROP CONSTRAINT IF EXISTS query_publish_events_tenant_id_fkey,
  ADD CONSTRAINT query_publish_events_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE siem_webhook_configs
  DROP CONSTRAINT IF EXISTS siem_webhook_configs_tenant_id_fkey,
  ADD CONSTRAINT siem_webhook_configs_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- backoffice_audit_logs.target_tenant_id -> SET NULL (not CASCADE)
-- BO audit logs are cross-tenant records that should survive tenant deletion
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'backoffice_audit_logs'
  ) THEN
    EXECUTE 'ALTER TABLE backoffice_audit_logs
      DROP CONSTRAINT IF EXISTS backoffice_audit_logs_target_tenant_id_tenants_id_fk,
      ADD CONSTRAINT backoffice_audit_logs_target_tenant_id_tenants_id_fk
        FOREIGN KEY (target_tenant_id) REFERENCES tenants(id) ON DELETE SET NULL';
  END IF;
END $$;
