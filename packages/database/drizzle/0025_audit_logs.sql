-- Custom SQL migration file, put your code below! --

-- Create the partitioned audit_logs table
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "mid" varchar NOT NULL,
  "event_type" varchar(100) NOT NULL,
  "actor_type" varchar(20) NOT NULL CHECK ("actor_type" IN ('user', 'system')),
  "actor_id" uuid,
  "target_id" varchar(255),
  "metadata" jsonb,
  "ip_address" varchar(45),
  "user_agent" varchar(500),
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("id", "created_at")
) PARTITION BY RANGE ("created_at");

-- Create initial monthly partitions
CREATE TABLE IF NOT EXISTS audit_logs_y2026m02 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS audit_logs_y2026m03 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS audit_logs_y2026m04 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Default partition catches any data outside defined ranges
CREATE TABLE IF NOT EXISTS audit_logs_default PARTITION OF audit_logs DEFAULT;

-- Indexes on parent table (auto-propagate to all partitions)
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_mid_created_idx"
  ON "audit_logs" USING btree ("tenant_id", "mid", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_mid_event_type_idx"
  ON "audit_logs" USING btree ("tenant_id", "mid", "event_type");
CREATE INDEX IF NOT EXISTS "audit_logs_metadata_gin_idx"
  ON "audit_logs" USING gin ("metadata" jsonb_path_ops);
