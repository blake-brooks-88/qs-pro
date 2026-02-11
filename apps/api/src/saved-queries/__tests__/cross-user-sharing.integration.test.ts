/**
 * Cross-User Sharing Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - No service mocking - behavioral assertions on DB state
 *
 * Key behaviors tested:
 * - When querySharing=true (pro tier), User B can read/mutate User A's queries
 * - When querySharing=false (free tier), User B is blocked from mutating User A's queries
 *
 * Note: User B requires a real DB record because `update` and `updateSqlAndLink`
 * create query_versions with the calling user's ID (FK to users.id).
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

const TEST_EID = 'eid-cross-user-int';
const TEST_TSSD = 'test-cross-user-int';
const TEST_MID = 'mid-cross-user-int';

describe('SavedQueriesService cross-user sharing integration', () => {
  let app: NestFastifyApplication;
  let savedQueriesService: SavedQueriesService;
  let sqlClient: Sql;

  let testTenantId: string;
  let testUserId: string;
  let otherUserId: string;

  const createdSavedQueryIds: string[] = [];

  const setTenantTier = async (tier: 'free' | 'pro' | 'enterprise') => {
    await sqlClient`
      UPDATE tenants
      SET subscription_tier = ${tier}
      WHERE id = ${testTenantId}::uuid
    `;
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
    savedQueriesService = app.get(SavedQueriesService);

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

    const userAResult = await sqlClient`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES ('sf-cross-user-a-int', ${testTenantId}, 'cross-user-a-int@example.com', 'Cross User A')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'Cross User A'
      RETURNING id
    `;
    const userARow = userAResult[0];
    if (!userARow) {
      throw new Error('Failed to insert test user A');
    }
    testUserId = userARow.id;

    const userBResult = await sqlClient`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES ('sf-cross-user-b-int', ${testTenantId}, 'cross-user-b-int@example.com', 'Cross User B')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'Cross User B'
      RETURNING id
    `;
    const userBRow = userBResult[0];
    if (!userBRow) {
      throw new Error('Failed to insert test user B');
    }
    otherUserId = userBRow.id;

    await setTenantTier('free');

    const reserved = await sqlClient.reserve();
    await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
    await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
    await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
    await reserved`DELETE FROM saved_queries WHERE tenant_id = ${testTenantId}::uuid`;
    await reserved`RESET app.tenant_id`;
    await reserved`RESET app.mid`;
    await reserved`RESET app.user_id`;
    reserved.release();
  }, 60000);

  afterAll(async () => {
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

    if (otherUserId) {
      await sqlClient`DELETE FROM users WHERE id = ${otherUserId}::uuid`;
    }
    if (testUserId) {
      await sqlClient`DELETE FROM users WHERE id = ${testUserId}::uuid`;
    }
    if (testTenantId) {
      await sqlClient`DELETE FROM tenants WHERE id = ${testTenantId}::uuid`;
    }

    await app.close();
  }, 30000);

  beforeEach(async () => {
    await setTenantTier('free');

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

  describe('Cross-user sharing (querySharing=true)', () => {
    describe('findById', () => {
      it('User B can read User A query when querySharing enabled', async () => {
        await setTenantTier('pro');

        const query = await savedQueriesService.create(
          testTenantId,
          TEST_MID,
          testUserId,
          { name: 'Shared Read Query', sqlText: 'SELECT 1' },
        );
        createdSavedQueryIds.push(query.id);

        const found = await savedQueriesService.findById(
          testTenantId,
          TEST_MID,
          otherUserId,
          query.id,
        );

        expect(found.id).toBe(query.id);
        expect(found.name).toBe('Shared Read Query');
        expect(found.sqlText).toBe('SELECT 1');
      });
    });

    describe('update', () => {
      it('User B can update User A query name and SQL when querySharing enabled', async () => {
        await setTenantTier('pro');

        const query = await savedQueriesService.create(
          testTenantId,
          TEST_MID,
          testUserId,
          { name: 'Shared Update Query', sqlText: 'SELECT 1' },
        );
        createdSavedQueryIds.push(query.id);

        const updated = await savedQueriesService.update(
          testTenantId,
          TEST_MID,
          otherUserId,
          query.id,
          { name: 'Updated By User B', sqlText: 'SELECT 2' },
        );

        expect(updated.id).toBe(query.id);
        expect(updated.name).toBe('Updated By User B');
        expect(updated.sqlText).toBe('SELECT 2');
      });
    });

    describe('delete', () => {
      it('User B can delete User A query when querySharing enabled', async () => {
        await setTenantTier('pro');

        const query = await savedQueriesService.create(
          testTenantId,
          TEST_MID,
          testUserId,
          { name: 'Shared Delete Query', sqlText: 'SELECT 1' },
        );
        createdSavedQueryIds.push(query.id);

        await savedQueriesService.delete(
          testTenantId,
          TEST_MID,
          otherUserId,
          query.id,
        );

        await expect(
          savedQueriesService.findById(
            testTenantId,
            TEST_MID,
            testUserId,
            query.id,
          ),
        ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });

        createdSavedQueryIds.splice(createdSavedQueryIds.indexOf(query.id), 1);
      });
    });

    describe('linkToQA', () => {
      it('User B can link User A query to QA when querySharing enabled', async () => {
        await setTenantTier('pro');

        const query = await savedQueriesService.create(
          testTenantId,
          TEST_MID,
          testUserId,
          { name: 'Shared Link Query', sqlText: 'SELECT 1' },
        );
        createdSavedQueryIds.push(query.id);

        const linked = await savedQueriesService.linkToQA(
          testTenantId,
          TEST_MID,
          otherUserId,
          query.id,
          {
            linkedQaObjectId: 'qa-obj-cross-link',
            linkedQaCustomerKey: 'qa-key-cross-link',
            linkedQaName: 'Cross User Link QA',
          },
        );

        expect(linked.id).toBe(query.id);
        expect(linked.linkedQaObjectId).toBe('qa-obj-cross-link');
        expect(linked.linkedQaCustomerKey).toBe('qa-key-cross-link');
        expect(linked.linkedQaName).toBe('Cross User Link QA');
        expect(linked.linkedAt).toBeInstanceOf(Date);
      });
    });

    describe('unlinkFromQA', () => {
      it('User B can unlink User A query from QA when querySharing enabled', async () => {
        await setTenantTier('pro');

        const query = await savedQueriesService.create(
          testTenantId,
          TEST_MID,
          testUserId,
          { name: 'Shared Unlink Query', sqlText: 'SELECT 1' },
        );
        createdSavedQueryIds.push(query.id);

        await savedQueriesService.linkToQA(
          testTenantId,
          TEST_MID,
          testUserId,
          query.id,
          {
            linkedQaObjectId: 'qa-obj-cross-unlink',
            linkedQaCustomerKey: 'qa-key-cross-unlink',
            linkedQaName: 'Cross User Unlink QA',
          },
        );

        const unlinked = await savedQueriesService.unlinkFromQA(
          testTenantId,
          TEST_MID,
          otherUserId,
          query.id,
        );

        expect(unlinked.id).toBe(query.id);
        expect(unlinked.linkedQaObjectId).toBeNull();
        expect(unlinked.linkedQaCustomerKey).toBeNull();
        expect(unlinked.linkedQaName).toBeNull();
        expect(unlinked.linkedAt).toBeNull();
      });
    });

    describe('updateSqlAndLink', () => {
      it('User B can update SQL and link User A query when querySharing enabled', async () => {
        await setTenantTier('pro');

        const query = await savedQueriesService.create(
          testTenantId,
          TEST_MID,
          testUserId,
          { name: 'Shared UpdateAndLink Query', sqlText: 'SELECT 1' },
        );
        createdSavedQueryIds.push(query.id);

        const result = await savedQueriesService.updateSqlAndLink(
          testTenantId,
          TEST_MID,
          otherUserId,
          query.id,
          'SELECT 99',
          {
            linkedQaObjectId: 'qa-obj-cross-uplink',
            linkedQaCustomerKey: 'qa-key-cross-uplink',
            linkedQaName: 'Cross User UpdateLink QA',
          },
        );

        expect(result.id).toBe(query.id);
        expect(result.sqlText).toBe('SELECT 99');
        expect(result.linkedQaObjectId).toBe('qa-obj-cross-uplink');
        expect(result.linkedQaCustomerKey).toBe('qa-key-cross-uplink');
        expect(result.linkedQaName).toBe('Cross User UpdateLink QA');
        expect(result.linkedAt).toBeInstanceOf(Date);
      });
    });
  });

  describe('Cross-user mutation blocked (querySharing=false)', () => {
    it('User B cannot update User A query on free tier', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Blocked Update Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      await expect(
        savedQueriesService.update(
          testTenantId,
          TEST_MID,
          otherUserId,
          query.id,
          { name: 'Should Fail', sqlText: 'SELECT 2' },
        ),
      ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });

    it('User B cannot delete User A query on free tier', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Blocked Delete Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      await expect(
        savedQueriesService.delete(
          testTenantId,
          TEST_MID,
          otherUserId,
          query.id,
        ),
      ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });

    it('User B cannot link User A query on free tier', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Blocked Link Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      await expect(
        savedQueriesService.linkToQA(
          testTenantId,
          TEST_MID,
          otherUserId,
          query.id,
          {
            linkedQaObjectId: 'qa-obj-blocked-link',
            linkedQaCustomerKey: 'qa-key-blocked-link',
            linkedQaName: 'Blocked Link QA',
          },
        ),
      ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });

    it('User B cannot unlink User A query on free tier', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Blocked Unlink Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-blocked-unlink',
          linkedQaCustomerKey: 'qa-key-blocked-unlink',
          linkedQaName: 'Blocked Unlink QA',
        },
      );

      await expect(
        savedQueriesService.unlinkFromQA(
          testTenantId,
          TEST_MID,
          otherUserId,
          query.id,
        ),
      ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
  });
});
