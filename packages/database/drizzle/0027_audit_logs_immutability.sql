-- Custom SQL migration file, put your code below! --

-- Layer 1: Trigger function that rejects UPDATE/DELETE operations
CREATE OR REPLACE FUNCTION audit_logs_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is immutable: % operations are not permitted', TG_OP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION audit_logs_immutable();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION audit_logs_immutable();

-- Tenant-level audit retention configuration
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "audit_retention_days" integer DEFAULT 365;
