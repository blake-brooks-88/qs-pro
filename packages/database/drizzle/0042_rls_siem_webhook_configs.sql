ALTER TABLE "siem_webhook_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "siem_webhook_configs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "siem_webhook_configs_tenant_isolation"
  ON "siem_webhook_configs"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id"::text = current_setting('app.tenant_id', true));
