ALTER TABLE "shell_query_runs" ADD COLUMN "sql_text_encrypted" text;
ALTER TABLE "shell_query_runs" ADD COLUMN "row_count" integer;
ALTER TABLE "shell_query_runs" ADD COLUMN "saved_query_id" uuid REFERENCES "saved_queries"("id");
DROP TABLE IF EXISTS "query_history";
