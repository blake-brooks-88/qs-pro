# packages/database

Drizzle ORM schemas, migrations, repositories, and database client for PostgreSQL 16.

## Commands

```bash
pnpm db:generate                   # Generate Drizzle migrations
pnpm db:migrate                    # Run migrations
pnpm db:audit-retention            # Run data retention policy enforcement
pnpm --filter @qpp/database test   # Unit tests
pnpm --filter @qpp/database test:integration  # Integration tests
```

## What This Package Provides

- **Schema:** All table definitions in `src/schema.ts` with Zod schema generation (`drizzle-zod`)
- **Repositories:** Interface-driven implementations (`DrizzleTenantRepository`, etc.)
- **Crypto:** Application-level encryption for sensitive fields
- **Client:** `createDatabase()` and `createSqlClient()` factory functions

## Gotchas

- **Migrations are manual:** `wtc start` does NOT auto-migrate. Always run `pnpm db:migrate` after creating a worktree.
- **RLS context variables:** Queries are filtered by `app.tenant_id` and `app.mid` set at connection level. Forgetting to set context = empty results or security leak.
- **Encryption key changes:** Require data re-encryption. Keys must match between app and DB.
- **Upsert patterns:** Uses `onConflictDoUpdate` — validate results when conflicts occur.
