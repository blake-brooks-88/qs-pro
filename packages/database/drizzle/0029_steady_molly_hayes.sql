ALTER TABLE "folders" ADD COLUMN "visibility" varchar DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD COLUMN "updated_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folders_visibility_idx" ON "folders" USING btree ("visibility");
