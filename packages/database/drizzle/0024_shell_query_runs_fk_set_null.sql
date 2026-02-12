ALTER TABLE "shell_query_runs" DROP CONSTRAINT "shell_query_runs_saved_query_id_fkey";
--> statement-breakpoint
ALTER TABLE "shell_query_runs" ADD CONSTRAINT "shell_query_runs_saved_query_id_saved_queries_id_fk"
  FOREIGN KEY ("saved_query_id") REFERENCES "public"."saved_queries"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
