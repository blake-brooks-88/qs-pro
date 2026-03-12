/**
 * Vitest globalSetup — runs once before/after the entire test suite.
 *
 * Purges orphaned test data to prevent accumulation across runs.
 * Individual test files still have their own afterAll cleanup for
 * the happy path; this is the safety net for interrupted runs.
 */
import { purgeTestData } from './purge-test-data';

export default async function setup() {
  async function tryPurge(prefix: string) {
    try {
      const purged = await purgeTestData();
      if (purged > 0) {
        // eslint-disable-next-line no-console -- test infrastructure log
        console.log(`[${prefix}] Purged ${purged} orphaned test tenants`);
      }
    } catch (error) {
      // Purging is a safety net; it should not prevent tests from running.
      // If infrastructure isn't reachable (e.g. local sandbox), continue and let
      // the actual integration/e2e tests fail with clearer context.

      console.warn(
        `[${prefix}] Skipping purge-test-data: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  await tryPurge('global-setup');

  return async function teardown() {
    await tryPurge('global-teardown');
  };
}
