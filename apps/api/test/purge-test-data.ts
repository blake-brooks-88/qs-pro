/**
 * Purges orphaned test data from the database.
 *
 * Integration/e2e tests create tenants, users, credentials, etc. with
 * recognisable EID patterns (e.g. "first-login-eid-1769275377327").
 * When a test run is interrupted or an afterAll hook fails, this data
 * is left behind. This module deletes it in FK-safe order.
 *
 * Used by vitest `globalSetup` so it runs:
 *   - BEFORE tests  → cleans up leftovers from previous interrupted runs
 *   - AFTER  tests  → cleans up data created during this run
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import postgres from 'postgres';

/**
 * Real (non-test) EIDs that must never be deleted.
 * Add any production/dev EIDs here as a safety net.
 */
const PRESERVED_EIDS = ['534019240', '10978264'];

/**
 * Parses a dotenv-style file into key-value pairs.
 * Handles CRLF/LF line endings, comments, and blank lines.
 */
function parseDotenv(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (key) {
      vars[key] = value;
    }
  }
  return vars;
}

/**
 * Builds a database URL that bypasses RLS (table owner or superuser).
 *
 * Reads credentials from (in priority order):
 *   1. PURGE_DATABASE_URL env var (explicit override for CI)
 *   2. .env file at the repo root (local dev — reads POSTGRES_USER/PASSWORD)
 *   3. DATABASE_URL with user swapped to qs_migrate (table owner, bypasses RLS)
 */
function getPrivilegedUrl(): string {
  if (process.env.PURGE_DATABASE_URL?.trim()) {
    return process.env.PURGE_DATABASE_URL;
  }

  // Try the repo-root .env file (process.cwd() = apps/api/)
  const envPath = resolve(process.cwd(), '../../.env');
  try {
    const vars = parseDotenv(readFileSync(envPath, 'utf-8'));

    // Prefer the migration user (table owner → bypasses RLS)
    const migrateUser = vars.QS_DB_MIGRATE_USER;
    const migratePassword = vars.QS_DB_MIGRATE_PASSWORD;
    const db = vars.POSTGRES_DB ?? 'qs_pro';
    if (migrateUser && migratePassword) {
      return `postgres://${migrateUser}:${migratePassword}@127.0.0.1:5432/${db}`;
    }

    // Fall back to the postgres superuser
    const user = vars.POSTGRES_USER ?? 'postgres';
    const password = vars.POSTGRES_PASSWORD;
    if (password) {
      return `postgres://${user}:${password}@127.0.0.1:5432/${db}`;
    }
  } catch {
    // .env doesn't exist (CI) — fall through
  }

  // Try DATABASE_URL_MIGRATIONS (CI sets this to the qs_migrate role)
  const migrationsUrl = process.env.DATABASE_URL_MIGRATIONS;
  if (migrationsUrl?.trim()) {
    return migrationsUrl;
  }

  // Last resort: swap DATABASE_URL user to qs_migrate
  const runtimeUrl = process.env.DATABASE_URL;
  if (runtimeUrl?.trim()) {
    const migratePassword = process.env.QS_DB_MIGRATE_PASSWORD;
    if (migratePassword) {
      return runtimeUrl.replace(
        /\/\/[^@]+@/,
        `//qs_migrate:${migratePassword}@`,
      );
    }
  }

  throw new Error(
    'Cannot determine database connection for test cleanup. ' +
      'Set PURGE_DATABASE_URL or ensure .env exists at the repo root.',
  );
}

export async function purgeTestData(): Promise<number> {
  const sql = postgres(getPrivilegedUrl(), { max: 1 });

  try {
    const [{ count }] = await sql<[{ count: number }]>`
      SELECT count(*)::int AS count FROM tenants
      WHERE eid LIKE '%-%-%'
        AND eid NOT IN ${sql(PRESERVED_EIDS)}
    `;

    if (count === 0) {
      return 0;
    }

    await sql.begin(async (tx) => {
      await tx`
        DELETE FROM shell_query_runs
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE eid LIKE '%-%-%' AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM query_publish_events
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE eid LIKE '%-%-%' AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM query_versions
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE eid LIKE '%-%-%' AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM credentials
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE eid LIKE '%-%-%' AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM saved_queries
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE eid LIKE '%-%-%' AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM folders
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE eid LIKE '%-%-%' AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM snippets
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE eid LIKE '%-%-%' AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM tenant_feature_overrides
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE eid LIKE '%-%-%' AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM tenant_settings
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE eid LIKE '%-%-%' AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM users
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE eid LIKE '%-%-%' AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_delete`;
      await tx`
        DELETE FROM tenants
        WHERE eid LIKE '%-%-%' AND eid NOT IN ${tx(PRESERVED_EIDS)}
      `;
      await tx`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_delete`;
    });

    return count;
  } finally {
    await sql.end();
  }
}
