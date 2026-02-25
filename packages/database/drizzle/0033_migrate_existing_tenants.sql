-- Enable RLS on org_subscriptions for defense-in-depth tenant isolation (tenant-only policy)
ALTER TABLE "org_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "org_subscriptions_tenant_isolation"
  ON "org_subscriptions"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id"::text = current_setting('app.tenant_id', true));
