ALTER TABLE "saved_queries" ADD COLUMN "linked_qa_object_id" varchar;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD COLUMN "linked_qa_customer_key" varchar;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD COLUMN "linked_qa_name" varchar;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD COLUMN "linked_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_queries_linked_qa_unique" ON "saved_queries" USING btree ("tenant_id","mid","linked_qa_customer_key") WHERE "saved_queries"."linked_qa_customer_key" IS NOT NULL;