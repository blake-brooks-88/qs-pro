ALTER TABLE "snippets" ADD COLUMN "trigger_prefix" varchar NOT NULL DEFAULT '';
ALTER TABLE "snippets" ADD COLUMN "description" text;
ALTER TABLE "snippets" ADD COLUMN "mid" varchar NOT NULL DEFAULT '0';
ALTER TABLE "snippets" ADD COLUMN "scope" varchar NOT NULL DEFAULT 'bu';
ALTER TABLE "snippets" ADD COLUMN "updated_at" timestamp DEFAULT now();
ALTER TABLE "snippets" ADD COLUMN "updated_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

DROP POLICY IF EXISTS "snippets_tenant_isolation" ON "snippets";
CREATE POLICY "snippets_tenant_bu_isolation"
  ON "snippets"
  USING (
    "tenant_id"::text = current_setting('app.tenant_id', true)
    AND ("scope" = 'tenant' OR "mid"::text = current_setting('app.mid', true))
  )
  WITH CHECK (
    "tenant_id"::text = current_setting('app.tenant_id', true)
    AND ("scope" = 'tenant' OR "mid"::text = current_setting('app.mid', true))
  );

CREATE INDEX IF NOT EXISTS "snippets_tenant_mid_idx" ON "snippets" ("tenant_id", "mid");
