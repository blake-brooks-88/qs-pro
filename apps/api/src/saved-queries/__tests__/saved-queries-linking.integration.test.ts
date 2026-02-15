/**
 * SavedQueriesService Linking Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - No service mocking - behavioral assertions on DB state
 *
 * Key behaviors tested:
 * - Version creation on SQL changes
 * - Link/unlink lifecycle
 * - Conflict detection for duplicate QA links
 * - Ownership checks (free vs pro tier)
 * - findAllLinkedQaKeys visibility rules
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

const TEST_EID = 'eid-sq-linking-int';
const TEST_TSSD = 'test-sq-linking-int';
const TEST_MID = 'mid-sq-linking-int';

describe('SavedQueriesService linking integration', () => {
  let app: NestFastifyApplication;
  let savedQueriesService: SavedQueriesService;
  let sqlClient: Sql;

  let testTenantId: string;
  let testUserId: string;

  const createdSavedQueryIds: string[] = [];

  const setTenantTier = async (tier: 'free' | 'pro' | 'enterprise') => {
    await sqlClient`
      UPDATE tenants
      SET subscription_tier = ${tier}
      WHERE id = ${testTenantId}::uuid
    `;
  };

  async function countVersions(savedQueryId: string): Promise<number> {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
      const result =
        await reserved`SELECT count(*)::int as count FROM query_versions WHERE saved_query_id = ${savedQueryId}::uuid`;
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      return result[0]?.count ?? 0;
    } finally {
      reserved.release();
    }
  }

  async function getSavedQueryFromDb(queryId: string) {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
      await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
      const result =
        await reserved`SELECT * FROM saved_queries WHERE id = ${queryId}::uuid`;
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      return result[0] ?? null;
    } finally {
      reserved.release();
    }
  }

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

    const userResult = await sqlClient`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES ('sf-sq-linking-int', ${testTenantId}, 'sq-linking-int@example.com', 'SQ Linking Test User')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'SQ Linking Test User'
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

  describe('versioning', () => {
    it('creates initial version on create', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Version Test Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const versionCount = await countVersions(query.id);
      expect(versionCount).toBe(1);
    });

    it('creates new version on SQL change', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Version Change Test', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      await savedQueriesService.update(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        { sqlText: 'SELECT 2' },
      );

      const versionCount = await countVersions(query.id);
      expect(versionCount).toBe(2);
    });

    it('skips version when SQL hash unchanged', async () => {
      const sqlText = 'SELECT 1';
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'No Version Test', sqlText },
      );
      createdSavedQueryIds.push(query.id);

      await savedQueriesService.update(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        { sqlText },
      );

      const versionCount = await countVersions(query.id);
      expect(versionCount).toBe(1);
    });

    it('creates version on name-only update with no SQL', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Name Only Test', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      await savedQueriesService.update(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        { name: 'Updated Name' },
      );

      const versionCount = await countVersions(query.id);
      expect(versionCount).toBe(1);
    });
  });

  describe('linkToQA', () => {
    it('links saved query to QA', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Link Test Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const linked = await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-link',
          linkedQaCustomerKey: 'qa-key-link',
          linkedQaName: 'Link QA',
        },
      );

      expect(linked.linkedQaObjectId).toBe('qa-obj-link');
      expect(linked.linkedQaCustomerKey).toBe('qa-key-link');
      expect(linked.linkedQaName).toBe('Link QA');
      expect(linked.linkedAt).toBeInstanceOf(Date);

      const dbRow = await getSavedQueryFromDb(query.id);
      expect(dbRow).not.toBeNull();
      if (!dbRow) {
        throw new Error('Expected saved query to exist in database');
      }
      expect(dbRow.linked_qa_object_id).toBe('qa-obj-link');
      expect(dbRow.linked_qa_customer_key).toBe('qa-key-link');
      expect(dbRow.linked_qa_name).toBe('Link QA');
      expect(dbRow.linked_at).toBeTruthy();
    });

    it('link conflict - same QA key linked to different query', async () => {
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

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query1.id,
        {
          linkedQaObjectId: 'qa-obj-conflict',
          linkedQaCustomerKey: 'qa-key-conflict',
          linkedQaName: 'Conflict QA',
        },
      );

      await expect(
        savedQueriesService.linkToQA(
          testTenantId,
          TEST_MID,
          testUserId,
          query2.id,
          {
            linkedQaObjectId: 'qa-obj-conflict',
            linkedQaCustomerKey: 'qa-key-conflict',
            linkedQaName: 'Conflict QA',
          },
        ),
      ).rejects.toMatchObject({ code: 'LINK_CONFLICT' });
    });

    it('ownership check - free tier, different user', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Owner Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const otherUserId = crypto.randomUUID();

      await expect(
        savedQueriesService.linkToQA(
          testTenantId,
          TEST_MID,
          otherUserId,
          query.id,
          {
            linkedQaObjectId: 'qa-obj-owner',
            linkedQaCustomerKey: 'qa-key-owner',
            linkedQaName: 'Owner QA',
          },
        ),
      ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
  });

  describe('unlinkFromQA', () => {
    it('unlinks saved query', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Unlink Test Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-unlink',
          linkedQaCustomerKey: 'qa-key-unlink',
          linkedQaName: 'Unlink QA',
        },
      );

      const unlinked = await savedQueriesService.unlinkFromQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
      );

      expect(unlinked.linkedQaObjectId).toBeNull();
      expect(unlinked.linkedQaCustomerKey).toBeNull();
      expect(unlinked.linkedQaName).toBeNull();
      expect(unlinked.linkedAt).toBeNull();

      const dbRow = await getSavedQueryFromDb(query.id);
      expect(dbRow).not.toBeNull();
      if (!dbRow) {
        throw new Error('Expected saved query to exist in database');
      }
      expect(dbRow.linked_qa_object_id).toBeNull();
      expect(dbRow.linked_qa_customer_key).toBeNull();
      expect(dbRow.linked_qa_name).toBeNull();
      expect(dbRow.linked_at).toBeNull();
    });

    it('ownership check - free tier, different user', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Unlink Owner Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-unlink-owner',
          linkedQaCustomerKey: 'qa-key-unlink-owner',
          linkedQaName: 'Unlink Owner QA',
        },
      );

      const otherUserId = crypto.randomUUID();

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

  describe('updateSqlAndLink', () => {
    it('updates SQL and links atomically', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Update Link Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const updated = await savedQueriesService.updateSqlAndLink(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        'SELECT 2',
        {
          linkedQaObjectId: 'qa-obj-update-link',
          linkedQaCustomerKey: 'qa-key-update-link',
          linkedQaName: 'Update Link QA',
        },
      );

      expect(updated.sqlText).toBe('SELECT 2');
      expect(updated.linkedQaObjectId).toBe('qa-obj-update-link');
      expect(updated.linkedQaCustomerKey).toBe('qa-key-update-link');
      expect(updated.linkedQaName).toBe('Update Link QA');

      const dbRow = await getSavedQueryFromDb(query.id);
      expect(dbRow).not.toBeNull();
      if (!dbRow) {
        throw new Error('Expected saved query to exist in database');
      }
      expect(dbRow.linked_qa_object_id).toBe('qa-obj-update-link');
      expect(dbRow.linked_qa_customer_key).toBe('qa-key-update-link');
      expect(dbRow.linked_qa_name).toBe('Update Link QA');
    });

    it('creates version during updateSqlAndLink', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Version Update Link Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      await savedQueriesService.updateSqlAndLink(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        'SELECT 2',
        {
          linkedQaObjectId: 'qa-obj-version-link',
          linkedQaCustomerKey: 'qa-key-version-link',
          linkedQaName: 'Version Link QA',
        },
      );

      const versionCount = await countVersions(query.id);
      expect(versionCount).toBe(2);
    });
  });

  describe('findAllLinkedQaKeys', () => {
    it('returns linked QA keys with names for same user (free tier)', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Find Keys Same User', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-find-same',
          linkedQaCustomerKey: 'qa-key-find-same',
          linkedQaName: 'Find Same QA',
        },
      );

      const linkedMap = await savedQueriesService.findAllLinkedQaKeys(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      expect(linkedMap.get('qa-key-find-same')).toBe('Find Keys Same User');
    });

    it('returns linked QA keys with null names for different user (free tier)', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Find Keys Different User', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-find-diff',
          linkedQaCustomerKey: 'qa-key-find-diff',
          linkedQaName: 'Find Diff QA',
        },
      );

      const otherUserId = crypto.randomUUID();
      const linkedMap = await savedQueriesService.findAllLinkedQaKeys(
        testTenantId,
        TEST_MID,
        otherUserId,
      );

      expect(linkedMap.get('qa-key-find-diff')).toBeNull();
    });

    it('returns linked QA keys with names for all users (pro tier)', async () => {
      await setTenantTier('pro');

      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Find Keys Pro User', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-find-pro',
          linkedQaCustomerKey: 'qa-key-find-pro',
          linkedQaName: 'Find Pro QA',
        },
      );

      const otherUserId = crypto.randomUUID();
      const linkedMap = await savedQueriesService.findAllLinkedQaKeys(
        testTenantId,
        TEST_MID,
        otherUserId,
      );

      expect(linkedMap.get('qa-key-find-pro')).toBe('Find Keys Pro User');
    });
  });
});
