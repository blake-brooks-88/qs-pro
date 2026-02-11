-- Custom SQL migration file, put your code below! --

-- Harden RLS on query_publish_events to match repo conventions:
-- (1) FORCE ROW LEVEL SECURITY (missing from 0021)
-- (2) Explicit WITH CHECK clause mirroring USING predicate

ALTER TABLE "query_publish_events" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "query_publish_events_tenant_isolation" ON "query_publish_events";
CREATE POLICY "query_publish_events_tenant_isolation"
  ON "query_publish_events"
  FOR ALL
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid = current_setting('app.mid', true)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid = current_setting('app.mid', true)
  );