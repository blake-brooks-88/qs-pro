/**
 * UsageService Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - No service mocking - behavioral assertions on DB state
 *
 * Key behaviors tested:
 * - Tier-based limit enforcement (free/pro/enterprise)
 * - Monthly run counting with real shell_query_runs
 * - Saved query counting via SavedQueriesService
 * - Reset date calculation
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import type { Sql } from 'postgres';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppModule } from '../../app.module';
import { configureApp } from '../../configure-app';
import { SavedQueriesService } from '../../saved-queries/saved-queries.service';
import type { ShellQueryRunRepository } from '../../shell-query/shell-query-run.repository';
import {
  FREE_TIER_RUN_LIMIT,
  FREE_TIER_SAVED_QUERY_LIMIT,
  UsageService,
} from '../usage.service';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_EID = 'eid-usage-int';
const TEST_TSSD = 'test-usage-int';
const TEST_MID = 'mid-usage-int';

describe('UsageService (integration)', () => {
  let app: NestFastifyApplication;
  let usageService: UsageService;
  let savedQueriesService: SavedQueriesService;
  let runRepo: ShellQueryRunRepository;
  let sqlClient: Sql;

  let testTenantId: string;
  let testUserId: string;

  const createdSavedQueryIds: string[] = [];
  const createdShellRunIds: string[] = [];

  const setTenantTier = async (tier: 'free' | 'pro' | 'enterprise') => {
    await sqlClient`
      UPDATE tenants
      SET subscription_tier = ${tier}
      WHERE id = ${testTenantId}::uuid
    `;
  };

  const seedShellQueryRun = async (): Promise<string> => {
    const id = crypto.randomUUID();
    await runRepo.createRun({
      id,
      tenantId: testTenantId,
      userId: testUserId,
      mid: TEST_MID,
      sqlTextHash: `hash-${id}`,
      status: 'ready',
    });
    return id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await configureApp(app, {
      globalPrefix: false,
      session: {
        secret: getRequiredEnv('SESSION_SECRET'),
        salt: getRequiredEnv('SESSION_SALT'),
        cookie: {
          secure: false,
          sameSite: 'lax',
        },
      },
      rls: true,
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    sqlClient = app.get<Sql>('SQL_CLIENT');
    usageService = app.get(UsageService);
    savedQueriesService = app.get(SavedQueriesService);
    runRepo = app.get<ShellQueryRunRepository>('SHELL_QUERY_RUN_REPOSITORY');

    const tenantResult = await sqlClient`
      INSERT INTO tenants (eid, tssd)
      VALUES (${TEST_EID}, ${TEST_TSSD})
      ON CONFLICT (eid) DO UPDATE SET tssd = ${TEST_TSSD}
      RETURNING id
    `;
    const tenantRow = tenantResult[0];
    if (!tenantRow) {
      throw new Error('Failed to insert test tenant');
    }
    testTenantId = tenantRow.id;

    const userResult = await sqlClient`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES ('sf-usage-int', ${testTenantId}, 'usage-int@example.com', 'Usage Test User')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'Usage Test User'
      RETURNING id
    `;
    const userRow = userResult[0];
    if (!userRow) {
      throw new Error('Failed to insert test user');
    }
    testUserId = userRow.id;

    await setTenantTier('free');

    const reserved = await sqlClient.reserve();
    await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
    await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
    await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
    await reserved`DELETE FROM shell_query_runs WHERE tenant_id = ${testTenantId}::uuid`;
    await reserved`DELETE FROM saved_queries WHERE tenant_id = ${testTenantId}::uuid`;
    await reserved`RESET app.tenant_id`;
    await reserved`RESET app.mid`;
    await reserved`RESET app.user_id`;
    reserved.release();
  }, 60000);

  afterAll(async () => {
    for (const id of createdShellRunIds) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
        await reserved`DELETE FROM shell_query_runs WHERE id = ${id}::uuid`;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
        reserved.release();
      } catch {
        // Best effort cleanup
      }
    }

    for (const id of createdSavedQueryIds) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
        await reserved`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
        reserved.release();
      } catch {
        // Best effort cleanup
      }
    }

    if (testUserId) {
      await sqlClient`DELETE FROM users WHERE id = ${testUserId}::uuid`;
    }
    if (testTenantId) {
      await sqlClient`DELETE FROM tenants WHERE id = ${testTenantId}::uuid`;
    }

    await app.close();
  }, 30000);

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await setTenantTier('free');

    for (const id of [...createdShellRunIds]) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
        await reserved`DELETE FROM shell_query_runs WHERE id = ${id}::uuid`;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
        reserved.release();
        createdShellRunIds.splice(createdShellRunIds.indexOf(id), 1);
      } catch {
        // Ignore
      }
    }

    for (const id of [...createdSavedQueryIds]) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
        await reserved`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
        reserved.release();
        createdSavedQueryIds.splice(createdSavedQueryIds.indexOf(id), 1);
      } catch {
        // Ignore
      }
    }
  });

  describe('exported constants', () => {
    it('FREE_TIER_RUN_LIMIT is 50', () => {
      expect(FREE_TIER_RUN_LIMIT).toBe(50);
    });

    it('FREE_TIER_SAVED_QUERY_LIMIT is 5', () => {
      expect(FREE_TIER_SAVED_QUERY_LIMIT).toBe(5);
    });
  });

  describe('getUsage()', () => {
    it('free tier with seeded data', async () => {
      await setTenantTier('free');

      const run1 = await seedShellQueryRun();
      createdShellRunIds.push(run1);
      const run2 = await seedShellQueryRun();
      createdShellRunIds.push(run2);
      const run3 = await seedShellQueryRun();
      createdShellRunIds.push(run3);

      const query1 = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Query 1', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query1.id);

      const query2 = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Query 2', sqlText: 'SELECT 2' },
      );
      createdSavedQueryIds.push(query2.id);

      const result = await usageService.getUsage(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      expect(result.queryRuns.limit).toBe(50);
      expect(result.queryRuns.current).toBe(3);
      expect(result.savedQueries.limit).toBe(5);
      expect(result.savedQueries.current).toBe(2);
    });

    it('pro tier', async () => {
      await setTenantTier('pro');

      const run1 = await seedShellQueryRun();
      createdShellRunIds.push(run1);

      const query1 = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Pro Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query1.id);

      const result = await usageService.getUsage(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      expect(result.queryRuns.limit).toBeNull();
      expect(result.queryRuns.current).toBe(1);
      expect(result.savedQueries.limit).toBeNull();
      expect(result.savedQueries.current).toBe(1);
    });

    it('enterprise tier', async () => {
      await setTenantTier('enterprise');

      const result = await usageService.getUsage(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      expect(result.queryRuns.limit).toBeNull();
      expect(result.savedQueries.limit).toBeNull();
    });

    it('zero counts (no data)', async () => {
      const result = await usageService.getUsage(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      expect(result.queryRuns.current).toBe(0);
      expect(result.savedQueries.current).toBe(0);
    });

    it('resetDate mid-month', async () => {
      vi.useFakeTimers({
        now: new Date(Date.UTC(2026, 1, 15, 10, 30, 0)),
        toFake: ['Date'],
      });

      const result = await usageService.getUsage(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      expect(result.queryRuns.resetDate).toBe(
        new Date(Date.UTC(2026, 2, 1)).toISOString(),
      );

      vi.useRealTimers();
    });

    it('resetDate December rollover', async () => {
      vi.useFakeTimers({
        now: new Date(Date.UTC(2026, 11, 20, 8, 0, 0)),
        toFake: ['Date'],
      });

      const result = await usageService.getUsage(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      expect(result.queryRuns.resetDate).toBe(
        new Date(Date.UTC(2027, 0, 1)).toISOString(),
      );

      vi.useRealTimers();
    });

    it('resetDate is valid ISO string', async () => {
      const result = await usageService.getUsage(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      const parsed = new Date(result.queryRuns.resetDate);
      expect(parsed.toISOString()).toBe(result.queryRuns.resetDate);
      expect(parsed.getUTCDate()).toBe(1);
    });
  });

  describe('getMonthlyRunCount()', () => {
    it('returns correct count', async () => {
      const run1 = await seedShellQueryRun();
      createdShellRunIds.push(run1);
      const run2 = await seedShellQueryRun();
      createdShellRunIds.push(run2);

      const result = await usageService.getMonthlyRunCount(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      expect(result).toBe(2);
    });

    it('returns zero with no runs', async () => {
      const result = await usageService.getMonthlyRunCount(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      expect(result).toBe(0);
    });
  });
});
