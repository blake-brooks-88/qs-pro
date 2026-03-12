ALTER TABLE "users" ADD COLUMN "role" varchar DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
CREATE TABLE "siem_webhook_configs" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") UNIQUE,
  "mid" varchar NOT NULL,
  "webhook_url" text NOT NULL,
  "secret_encrypted" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "consecutive_failures" integer DEFAULT 0 NOT NULL,
  "last_success_at" timestamp,
  "last_failure_at" timestamp,
  "last_failure_reason" text,
  "disabled_at" timestamp,
  "disabled_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "siem_webhook_configs_tenant_id_idx" ON "siem_webhook_configs" ("tenant_id");
