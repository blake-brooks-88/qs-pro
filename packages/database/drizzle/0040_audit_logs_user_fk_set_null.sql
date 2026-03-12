ALTER TABLE "backoffice_audit_logs" ALTER COLUMN "backoffice_user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "backoffice_audit_logs" DROP CONSTRAINT "backoffice_audit_logs_backoffice_user_id_bo_users_id_fk";
--> statement-breakpoint
ALTER TABLE "backoffice_audit_logs" ADD CONSTRAINT "backoffice_audit_logs_backoffice_user_id_bo_users_id_fk" FOREIGN KEY ("backoffice_user_id") REFERENCES "public"."bo_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
