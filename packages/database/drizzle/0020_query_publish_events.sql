-- Custom SQL migration file, put your code below! --

CREATE TABLE IF NOT EXISTS "query_publish_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "saved_query_id" uuid NOT NULL REFERENCES "saved_queries"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL REFERENCES "query_versions"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "mid" varchar NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "linked_qa_customer_key" varchar NOT NULL,
  "published_sql_hash" varchar NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "query_publish_events_saved_query_id_idx" ON "query_publish_events" USING btree ("saved_query_id");
CREATE INDEX IF NOT EXISTS "query_publish_events_version_id_idx" ON "query_publish_events" USING btree ("version_id");
CREATE INDEX IF NOT EXISTS "query_publish_events_tenant_id_idx" ON "query_publish_events" USING btree ("tenant_id");
