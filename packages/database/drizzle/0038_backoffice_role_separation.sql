ALTER TABLE "bo_users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qs_backoffice') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "bo_users" TO qs_backoffice;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "bo_sessions" TO qs_backoffice;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "bo_accounts" TO qs_backoffice;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "bo_verifications" TO qs_backoffice;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "bo_two_factors" TO qs_backoffice;
    GRANT SELECT, INSERT ON "backoffice_audit_logs" TO qs_backoffice;
    GRANT SELECT, INSERT, UPDATE ON "org_subscriptions" TO qs_backoffice;
    GRANT SELECT, INSERT, UPDATE ON "stripe_billing_bindings" TO qs_backoffice;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_feature_overrides" TO qs_backoffice;
    GRANT SELECT ON "tenants" TO qs_backoffice;
    GRANT SELECT ON "users" TO qs_backoffice;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qs_runtime') THEN
    REVOKE ALL PRIVILEGES ON "bo_users" FROM qs_runtime;
    REVOKE ALL PRIVILEGES ON "bo_sessions" FROM qs_runtime;
    REVOKE ALL PRIVILEGES ON "bo_accounts" FROM qs_runtime;
    REVOKE ALL PRIVILEGES ON "bo_verifications" FROM qs_runtime;
    REVOKE ALL PRIVILEGES ON "bo_two_factors" FROM qs_runtime;
    REVOKE ALL PRIVILEGES ON "backoffice_audit_logs" FROM qs_runtime;
  END IF;
END
$$;
