-- Custom SQL migration file, put your code below! --

ALTER TABLE "query_publish_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "query_publish_events_tenant_isolation"
  ON "query_publish_events"
  FOR ALL
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid = current_setting('app.mid', true)
  );
