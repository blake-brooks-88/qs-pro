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
import postgres from 'postgres';

import { getPrivilegedUrl } from './helpers/privileged-db-url';

/**
 * Real (non-test) EIDs that must never be deleted.
 * Add any production/dev EIDs here as a safety net.
 */
const PRESERVED_EIDS = ['534019240', '10978264'];

/**
 * Legacy test EIDs from old test code that didn't follow the `test---` convention.
 * These are explicitly targeted for cleanup since they don't match the `test---%` pattern.
 */
const LEGACY_TEST_EIDS = [
  'csrf-eid',
  'other-eid',
  'eid-123',
  'eid-jwt',
  'eid-refresh',
];

export async function purgeTestData(): Promise<number> {
  const sql = postgres(getPrivilegedUrl(), { max: 1 });

  try {
    const [{ count }] = await sql<[{ count: number }]>`
      SELECT count(*)::int AS count FROM tenants
      WHERE (eid LIKE 'test---%' OR eid IN ${sql(LEGACY_TEST_EIDS)})
        AND eid NOT IN ${sql(PRESERVED_EIDS)}
    `;

    if (count === 0) {
      return 0;
    }

    await sql.begin(async (tx) => {
      await tx`
        DELETE FROM shell_query_runs
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM query_publish_events
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM query_versions
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM credentials
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM saved_queries
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM folders
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM snippets
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM tenant_feature_overrides
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM tenant_settings
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;

      // org_subscriptions: FORCE RLS blocks the table owner (qs_migrate).
      // Temporarily lift it so orphaned rows can be cleaned up before
      // deleting the parent tenants row (FK ON DELETE no action).
      await tx`ALTER TABLE org_subscriptions NO FORCE ROW LEVEL SECURITY`;
      await tx`
        DELETE FROM org_subscriptions
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`ALTER TABLE org_subscriptions FORCE ROW LEVEL SECURITY`;

      // audit_logs: FORCE RLS blocks the table owner (qs_migrate), and an
      // immutability trigger prevents direct DELETE. Temporarily lift both
      // within this transaction so orphaned audit rows can be cleaned up
      // before deleting the parent tenants row (ON DELETE CASCADE would fail
      // because the trigger blocks the cascaded delete).
      await tx`ALTER TABLE audit_logs NO FORCE ROW LEVEL SECURITY`;
      await tx`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_delete`;
      await tx`
        DELETE FROM audit_logs
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_delete`;
      await tx`ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY`;

      await tx`
        DELETE FROM credentials
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM credentials
        WHERE user_id IN (
          SELECT id FROM users WHERE tenant_id IN (
            SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
          )
        )`;
      await tx`
        DELETE FROM users
        WHERE tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM backoffice_audit_logs
        WHERE target_tenant_id IN (
          SELECT id FROM tenants WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
        )`;
      await tx`
        DELETE FROM tenants
        WHERE (eid LIKE 'test---%' OR eid IN ${tx(LEGACY_TEST_EIDS)}) AND eid NOT IN ${tx(PRESERVED_EIDS)}
      `;
    });

    return count;
  } finally {
    await sql.end();
  }
}
