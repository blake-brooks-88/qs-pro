ALTER TABLE "org_subscriptions"
ADD COLUMN "stripe_state_updated_at" timestamp;
--> statement-breakpoint

UPDATE "org_subscriptions"
SET "stripe_state_updated_at" = COALESCE("updated_at", NOW())
WHERE "stripe_state_updated_at" IS NULL;
