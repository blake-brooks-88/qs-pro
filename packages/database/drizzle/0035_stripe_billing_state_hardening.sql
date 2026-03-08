CREATE TABLE "stripe_billing_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"stripe_customer_id" varchar,
	"stripe_subscription_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_billing_bindings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_checkout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"idempotency_key" varchar NOT NULL,
	"session_id" varchar,
	"session_url" text,
	"tier" varchar NOT NULL,
	"interval" varchar NOT NULL,
	"status" varchar DEFAULT 'creating' NOT NULL,
	"expires_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_checkout_sessions_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "org_subscriptions" DROP CONSTRAINT "org_subscriptions_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD COLUMN "stripe_subscription_status" varchar DEFAULT 'inactive' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD COLUMN "last_invoice_paid_at" timestamp;--> statement-breakpoint
ALTER TABLE "stripe_billing_bindings" ADD CONSTRAINT "stripe_billing_bindings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_checkout_sessions" ADD CONSTRAINT "stripe_checkout_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

UPDATE "org_subscriptions"
SET
	"stripe_subscription_status" = CASE
		WHEN "stripe_subscription_id" IS NOT NULL THEN 'active'
		ELSE 'inactive'
	END,
	"last_invoice_paid_at" = CASE
		WHEN "stripe_subscription_id" IS NOT NULL
			AND "current_period_ends" IS NOT NULL
			AND "current_period_ends" > NOW()
		THEN NOW()
		ELSE NULL
	END;--> statement-breakpoint

INSERT INTO "stripe_billing_bindings" (
	"tenant_id",
	"stripe_customer_id",
	"stripe_subscription_id"
)
SELECT
	"tenant_id",
	"stripe_customer_id",
	"stripe_subscription_id"
FROM "org_subscriptions"
WHERE "stripe_customer_id" IS NOT NULL OR "stripe_subscription_id" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "stripe_billing_bindings_customer_id_idx" ON "stripe_billing_bindings" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_billing_bindings_subscription_id_idx" ON "stripe_billing_bindings" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "stripe_checkout_sessions_tenant_id_idx" ON "stripe_checkout_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_checkout_sessions_idempotency_key_idx" ON "stripe_checkout_sessions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_checkout_sessions_session_id_idx" ON "stripe_checkout_sessions" USING btree ("session_id");--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
