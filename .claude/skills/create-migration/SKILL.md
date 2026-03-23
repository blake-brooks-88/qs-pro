---
name: create-migration
description: Scaffold a new Drizzle SQL migration with RLS policies, role grants, and rollback notes for QS Pro. Use when creating a new database migration.
disable-model-invocation: true
---

# Create Migration

Scaffolds a new SQL migration file in `packages/database/drizzle/` following QS Pro conventions.

## Steps

1. **Determine the next migration number** by checking the highest-numbered file in `packages/database/drizzle/`:
   ```bash
   ls packages/database/drizzle/*.sql | sort | tail -1
   ```
   Increment the number by 1, zero-padded to 4 digits.

2. **Ask the user** what the migration should do (table name, columns, purpose) if not already specified in the invocation arguments.

3. **Create the migration file** at `packages/database/drizzle/{number}_{descriptive_name}.sql` using this template:

```sql
-- {Brief description of what this migration does}

-- Schema changes
{CREATE TABLE / ALTER TABLE statements}

-- Enable RLS (for new tables)
ALTER TABLE "{table_name}" ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "{table_name}_tenant_isolation"
  ON "{table_name}"
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid::text = current_setting('app.mid', true)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND mid::text = current_setting('app.mid', true)
  );

-- Role grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "{table_name}" TO qs_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "{table_name}" TO qs_backoffice;
```

4. **Adapt the template** based on what the user needs:
   - **Lookup/reference tables** (no tenant scope): Skip RLS, grant SELECT only to `qs_runtime`
   - **Read-only tables**: Grant only SELECT
   - **Tables needing admin bypass**: Add an admin bypass policy following `0052_admin_bypass_snippets_and_audit_logs.sql` pattern
   - **ALTER TABLE additions**: Skip RLS/grants if the table already has them
   - **Index additions**: Use `CREATE INDEX CONCURRENTLY` for large tables

5. **Update the Drizzle schema** if needed — check if `packages/database/src/schema/` has a corresponding schema file that needs updating.

6. **Remind the user** to run:
   ```bash
   pnpm db:migrate
   ```

## Conventions
- SQL keywords UPPERCASE, identifiers snake_case
- Always include `current_setting(..., true)` — the `true` prevents errors when the setting is unset
- Never reference `qs_migrate` in policy definitions
- File name format: `{4-digit-number}_{descriptive_snake_case_name}.sql`
