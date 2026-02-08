/**
 * Vitest globalSetup — runs once before/after the entire test suite.
 *
 * Purges orphaned test data to prevent accumulation across runs.
 * Individual test files still have their own afterAll cleanup for
 * the happy path; this is the safety net for interrupted runs.
 */
import { purgeTestData } from './purge-test-data';

export default async function setup() {
  const purged = await purgeTestData();
  if (purged > 0) {
    // eslint-disable-next-line no-console -- test infrastructure log
    console.log(`[global-setup] Purged ${purged} orphaned test tenants`);
  }

  return async function teardown() {
    const purgedAfter = await purgeTestData();
    if (purgedAfter > 0) {
      // eslint-disable-next-line no-console -- test infrastructure log
      console.log(`[global-teardown] Purged ${purgedAfter} test tenants`);
    }
  };
}
