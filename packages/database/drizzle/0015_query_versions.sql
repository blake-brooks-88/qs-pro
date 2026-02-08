-- Custom SQL migration file, put your code below! --

CREATE TABLE IF NOT EXISTS "query_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "saved_query_id" uuid NOT NULL REFERENCES "saved_queries"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "mid" varchar NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "sql_text_encrypted" text NOT NULL,
  "sql_text_hash" varchar NOT NULL,
  "version_name" varchar(255),
  "line_count" integer NOT NULL,
  "source" varchar DEFAULT 'save' NOT NULL,
  "restored_from_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "query_versions_saved_query_id_idx" ON "query_versions" USING btree ("saved_query_id");
CREATE INDEX IF NOT EXISTS "query_versions_tenant_id_idx" ON "query_versions" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "query_versions_created_at_idx" ON "query_versions" USING btree ("created_at");
