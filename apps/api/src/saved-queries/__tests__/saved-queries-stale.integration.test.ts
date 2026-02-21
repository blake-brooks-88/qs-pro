/**
 * Stale Detection Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - MSW for MCE HTTP (external API - required for auth module initialization)
 * - No internal service mocking - behavioral assertions on service results
 *
 * Key behaviors tested:
 * - expectedHash comparison on update (stale detection)
 * - 409 STALE_CONTENT response on hash mismatch
 * - Backwards-compat: no expectedHash still works
 * - updatedByUserId tracking
 * - updatedByUserName resolution
 * - latestVersionHash in findById response
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { ErrorCode } from '@qpp/backend-shared';
import { externalOnlyOnUnhandledRequest } from '@qpp/test-utils';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Sql } from 'postgres';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { AppModule } from '../../app.module';
import { configureApp } from '../../configure-app';
import { SavedQueriesService } from '../saved-queries.service';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_TSSD = 'test-stale-int';
const TEST_EID = 'eid-stale-int';
const TEST_MID = 'mid-stale-int';

const defaultHandlers = [
  http.post(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`, () => {
    return HttpResponse.json({
      access_token: 'stale-int-access-token',
      refresh_token: 'stale-int-refresh-token',
      expires_in: 3600,
      rest_instance_url: 'https://test-rest.com',
      soap_instance_url: `https://${TEST_TSSD}.soap.marketingcloudapis.com`,
      scope: 'read write',
      token_type: 'Bearer',
    });
  }),
  http.get(
    `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
    () => {
      return HttpResponse.json({
        sub: 'sf-stale-int',
        enterprise_id: TEST_EID,
        member_id: TEST_MID,
        email: 'stale-int@example.com',
        name: 'Stale Integration User',
      });
    },
  ),
];

const server = setupServer(...defaultHandlers);

describe('Stale Detection (integration)', () => {
  let app: NestFastifyApplication;
  let savedQueriesService: SavedQueriesService;
  let sqlClient: Sql;

  let testTenantId: string;
  let testUserIdA: string;
  let testUserIdB: string;
  let testFolderId: string;

  const createdSavedQueryIds: string[] = [];

  async function withRls(
    tenantId: string,
    mid: string,
    userId: string,
    fn: (reserved: Sql) => Promise<void>,
  ) {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${mid}, false)`;
      await reserved`SELECT set_config('app.user_id', ${userId}, false)`;
      await fn(reserved as unknown as Sql);
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      reserved.release();
    }
  }

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: externalOnlyOnUnhandledRequest() });

    process.env.MCE_TSSD = TEST_TSSD;

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
        cookie: { secure: false, sameSite: 'lax' },
      },
      rls: true,
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    sqlClient = app.get<Sql>('SQL_CLIENT');
    savedQueriesService = app.get(SavedQueriesService);

    // Create enterprise tenant (stale detection relevant for shared queries)
    const tenantResult = await sqlClient`
      INSERT INTO tenants (eid, tssd, subscription_tier)
      VALUES (${TEST_EID}, ${TEST_TSSD}, 'enterprise')
      ON CONFLICT (eid) DO UPDATE SET tssd = ${TEST_TSSD}, subscription_tier = 'enterprise'
      RETURNING id
    `;
    const tenantRow = tenantResult[0];
    if (!tenantRow) {
      throw new Error('Failed to insert test tenant');
    }
    testTenantId = tenantRow.id;

    // Create User A
    const userAResult = await sqlClient`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES ('sf-stale-int-a', ${testTenantId}, 'stale-a@example.com', 'User A')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'User A'
      RETURNING id
    `;
    const userARow = userAResult[0];
    if (!userARow) {
      throw new Error('Failed to insert test user A');
    }
    testUserIdA = userARow.id;

    // Create User B
    const userBResult = await sqlClient`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES ('sf-stale-int-b', ${testTenantId}, 'stale-b@example.com', 'User B')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'User B'
      RETURNING id
    `;
    const userBRow = userBResult[0];
    if (!userBRow) {
      throw new Error('Failed to insert test user B');
    }
    testUserIdB = userBRow.id;

    // Create a shared folder for queries
    await withRls(testTenantId, TEST_MID, testUserIdA, async (r) => {
      const folderResult = await r`
        INSERT INTO folders (tenant_id, mid, user_id, name, visibility)
        VALUES (${testTenantId}::uuid, ${TEST_MID}, ${testUserIdA}::uuid, 'Shared Test Folder', 'shared')
        RETURNING id
      `;
      const folderRow = folderResult[0];
      if (!folderRow) {
        throw new Error('Failed to insert test folder');
      }
      testFolderId = folderRow.id;
    });
  }, 60000);

  afterAll(async () => {
    server.close();

    // Clean up saved queries
    for (const id of createdSavedQueryIds) {
      try {
        await withRls(testTenantId, TEST_MID, testUserIdA, async (r) => {
          await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
        });
      } catch {
        // Best effort
      }
    }

    // Clean up folder
    if (testFolderId) {
      try {
        await withRls(testTenantId, TEST_MID, testUserIdA, async (r) => {
          await r`DELETE FROM folders WHERE id = ${testFolderId}::uuid`;
        });
      } catch {
        // Best effort
      }
    }

    // Clean up users and tenant
    if (testUserIdA) {
      await sqlClient`DELETE FROM users WHERE id = ${testUserIdA}::uuid`;
    }
    if (testUserIdB) {
      await sqlClient`DELETE FROM users WHERE id = ${testUserIdB}::uuid`;
    }
    if (testTenantId) {
      await sqlClient`DELETE FROM tenants WHERE id = ${testTenantId}::uuid`;
    }

    await app.close();
  }, 30000);

  beforeEach(() => {
    server.resetHandlers();
  });

  afterEach(async () => {
    for (const id of [...createdSavedQueryIds]) {
      try {
        await withRls(testTenantId, TEST_MID, testUserIdA, async (r) => {
          await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
        });
        createdSavedQueryIds.splice(createdSavedQueryIds.indexOf(id), 1);
      } catch {
        // Ignore
      }
    }
  });

  describe('stale detection', () => {
    it('update with matching expectedHash succeeds', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserIdA,
        { name: 'Match Hash', sqlText: 'SELECT 1', folderId: testFolderId },
      );
      createdSavedQueryIds.push(query.id);

      const detail = await savedQueriesService.findById(
        testTenantId,
        TEST_MID,
        testUserIdA,
        query.id,
      );

      const updated = await savedQueriesService.update(
        testTenantId,
        TEST_MID,
        testUserIdA,
        query.id,
        {
          sqlText: 'SELECT 2',
          expectedHash: detail.latestVersionHash ?? '',
        },
      );

      expect(updated.sqlText).toBe('SELECT 2');
    });

    it('update with mismatched expectedHash returns STALE_CONTENT', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserIdA,
        { name: 'Mismatch Hash', sqlText: 'SELECT 1', folderId: testFolderId },
      );
      createdSavedQueryIds.push(query.id);

      await expect(
        savedQueriesService.update(
          testTenantId,
          TEST_MID,
          testUserIdA,
          query.id,
          {
            sqlText: 'SELECT 2',
            expectedHash: 'wrong-hash-value',
          },
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.STALE_CONTENT,
      });
    });

    it('update without expectedHash succeeds (backwards compat)', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserIdA,
        { name: 'No Hash', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const updated = await savedQueriesService.update(
        testTenantId,
        TEST_MID,
        testUserIdA,
        query.id,
        { sqlText: 'SELECT 2' },
      );

      expect(updated.sqlText).toBe('SELECT 2');
    });

    it('name-only update without expectedHash succeeds', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserIdA,
        { name: 'Name Only', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const updated = await savedQueriesService.update(
        testTenantId,
        TEST_MID,
        testUserIdA,
        query.id,
        { name: 'Renamed' },
      );

      expect(updated.name).toBe('Renamed');
    });
  });

  describe('updatedByUserId tracking', () => {
    it('updatedByUserName is set after update', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserIdA,
        {
          name: 'Track Updater',
          sqlText: 'SELECT 1',
          folderId: testFolderId,
        },
      );
      createdSavedQueryIds.push(query.id);

      await savedQueriesService.update(
        testTenantId,
        TEST_MID,
        testUserIdB,
        query.id,
        { sqlText: 'SELECT 2' },
      );

      const detail = await savedQueriesService.findById(
        testTenantId,
        TEST_MID,
        testUserIdA,
        query.id,
      );

      expect(detail.updatedByUserName).toBe('User B');
    });

    it('updatedByUserName shows the latest updater', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserIdA,
        {
          name: 'Latest Updater',
          sqlText: 'SELECT 1',
          folderId: testFolderId,
        },
      );
      createdSavedQueryIds.push(query.id);

      // User B updates
      await savedQueriesService.update(
        testTenantId,
        TEST_MID,
        testUserIdB,
        query.id,
        { sqlText: 'SELECT 2' },
      );

      // User A updates again
      const detail2 = await savedQueriesService.findById(
        testTenantId,
        TEST_MID,
        testUserIdA,
        query.id,
      );

      await savedQueriesService.update(
        testTenantId,
        TEST_MID,
        testUserIdA,
        query.id,
        { sqlText: 'SELECT 3', expectedHash: detail2.latestVersionHash ?? '' },
      );

      const detail = await savedQueriesService.findById(
        testTenantId,
        TEST_MID,
        testUserIdA,
        query.id,
      );

      expect(detail.updatedByUserName).toBe('User A');
    });
  });

  describe('latestVersionHash', () => {
    it('findById response includes latestVersionHash', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserIdA,
        { name: 'Hash Check', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const detail = await savedQueriesService.findById(
        testTenantId,
        TEST_MID,
        testUserIdA,
        query.id,
      );

      expect(detail.latestVersionHash).toBeDefined();
      expect(detail.latestVersionHash).not.toBeNull();
      expect(typeof detail.latestVersionHash).toBe('string');
    });

    it('latestVersionHash changes after saving new SQL', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserIdA,
        { name: 'Hash Change', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const detailBefore = await savedQueriesService.findById(
        testTenantId,
        TEST_MID,
        testUserIdA,
        query.id,
      );

      await savedQueriesService.update(
        testTenantId,
        TEST_MID,
        testUserIdA,
        query.id,
        {
          sqlText: 'SELECT 999',
          expectedHash: detailBefore.latestVersionHash ?? '',
        },
      );

      const detailAfter = await savedQueriesService.findById(
        testTenantId,
        TEST_MID,
        testUserIdA,
        query.id,
      );

      expect(detailAfter.latestVersionHash).not.toBe(
        detailBefore.latestVersionHash,
      );
    });
  });
});
