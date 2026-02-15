/**
 * DrizzleSavedQueriesRepository Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - No mocking - behavioral assertions on DB state
 *
 * Key behaviors tested:
 * - All repository CRUD operations
 * - RLS enforcement via AsyncLocalStorage
 * - Query sharing visibility logic
 * - Link operations and unique constraint validation
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { RlsContextService } from '@qpp/backend-shared';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { configureApp } from '../../configure-app';
import type {
  SavedQueriesRepository,
  SavedQuery,
} from '../saved-queries.repository';

type LinkedQaKeyRow = Awaited<
  ReturnType<SavedQueriesRepository['findAllLinkedQaKeys']>
>[number];

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_EID = 'eid-repo-int';
const TEST_TSSD = 'test-repo-int';
const TEST_MID = 'mid-repo-int';

describe('DrizzleSavedQueriesRepository (integration)', () => {
  let app: NestFastifyApplication;
  let repo: SavedQueriesRepository;
  let rlsContext: RlsContextService;
  let sqlClient: Sql;

  let testTenantId: string;
  let testUserId: string;

  const createdSavedQueryIds: string[] = [];

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
    repo = app.get<SavedQueriesRepository>('SAVED_QUERIES_REPOSITORY');
    rlsContext = app.get(RlsContextService);

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
      VALUES ('sf-repo-int', ${testTenantId}, 'repo-int@example.com', 'Repo Test User')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'Repo Test User'
      RETURNING id
    `;
    const userRow = userResult[0];
    if (!userRow) {
      throw new Error('Failed to insert test user');
    }
    testUserId = userRow.id;

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
      await sqlClient`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_delete`;
      await sqlClient`DELETE FROM tenants WHERE id = ${testTenantId}::uuid`;
      await sqlClient`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_delete`;
    }

    await app.close();
  }, 30000);

  beforeEach(async () => {
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

  describe('create()', () => {
    it('should insert row and return all fields', async () => {
      let result: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          result = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'Test Query',
            sqlTextEncrypted: 'encrypted:SELECT 1',
          });
        },
      );

      if (!result) {
        throw new Error('Expected result from create');
      }

      createdSavedQueryIds.push(result.id);

      expect(result.id).toBeTypeOf('string');
      expect(result.tenantId).toBe(testTenantId);
      expect(result.mid).toBe(TEST_MID);
      expect(result.userId).toBe(testUserId);
      expect(result.name).toBe('Test Query');
      expect(result.sqlTextEncrypted).toBe('encrypted:SELECT 1');
      expect(result.folderId).toBeNull();
      expect(result.linkedQaObjectId).toBeNull();
      expect(result.linkedQaCustomerKey).toBeNull();
      expect(result.linkedQaName).toBeNull();
      expect(result.linkedAt).toBeNull();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('findById()', () => {
    it('should return the created row', async () => {
      let created: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          created = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'FindById Test',
            sqlTextEncrypted: 'encrypted:SELECT 2',
          });
        },
      );

      if (!created) {
        throw new Error('Expected created query');
      }
      const createdId = created.id;
      createdSavedQueryIds.push(createdId);

      let found: SavedQuery | null | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          found = await repo.findById(createdId);
        },
      );

      expect(found).not.toBeNull();
      if (!found) {
        throw new Error('Expected found query');
      }
      expect(found.id).toBe(createdId);
      expect(found.name).toBe('FindById Test');
      expect(found.sqlTextEncrypted).toBe('encrypted:SELECT 2');
    });

    it('should return null for nonexistent UUID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      let found: SavedQuery | null | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          found = await repo.findById(fakeId);
        },
      );

      expect(found).toBeNull();
    });
  });

  describe('findAll()', () => {
    it('should return only own queries when querySharingEnabled=false', async () => {
      let created: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          created = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'My Private Query',
            sqlTextEncrypted: 'encrypted:SELECT 3',
          });
        },
      );

      if (!created) {
        throw new Error('Expected created query');
      }
      const createdId = created.id;
      createdSavedQueryIds.push(createdId);

      let results: SavedQuery[] | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          results = await repo.findAll(testUserId, false);
        },
      );

      if (!results) {
        throw new Error('Expected results');
      }
      expect(results.length).toBeGreaterThan(0);
      const found = results.find((q) => q.id === createdId);
      expect(found).toBeDefined();
      expect(found?.name).toBe('My Private Query');
    });

    it('should return cross-user queries within same tenant/mid when querySharingEnabled=true', async () => {
      const otherUserResult = await sqlClient`
        INSERT INTO users (sf_user_id, tenant_id, email, name)
        VALUES ('sf-repo-other', ${testTenantId}, 'repo-other@example.com', 'Other User')
        ON CONFLICT (sf_user_id) DO UPDATE SET name = 'Other User'
        RETURNING id
      `;
      const otherUserRow = otherUserResult[0];
      if (!otherUserRow) {
        throw new Error('Failed to insert other user');
      }
      const otherUserId = otherUserRow.id;

      let query1: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          query1 = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'User1 Query',
            sqlTextEncrypted: 'encrypted:SELECT 4',
          });
        },
      );

      if (!query1) {
        throw new Error('Expected query1');
      }
      const query1Id = query1.id;
      createdSavedQueryIds.push(query1Id);

      let query2: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        otherUserId,
        async () => {
          query2 = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: otherUserId,
            name: 'User2 Query',
            sqlTextEncrypted: 'encrypted:SELECT 5',
          });
        },
      );

      if (!query2) {
        throw new Error('Expected query2');
      }
      const query2Id = query2.id;
      createdSavedQueryIds.push(query2Id);

      let results: SavedQuery[] | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          results = await repo.findAll(testUserId, true);
        },
      );

      if (!results) {
        throw new Error('Expected results');
      }
      const found1 = results.find((q) => q.id === query1Id);
      const found2 = results.find((q) => q.id === query2Id);
      expect(found1).toBeDefined();
      expect(found2).toBeDefined();

      const reserved = await sqlClient.reserve();
      await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
      await reserved`SELECT set_config('app.user_id', ${otherUserId}, false)`;
      await reserved`DELETE FROM saved_queries WHERE user_id = ${otherUserId}::uuid`;
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      reserved.release();

      await sqlClient`DELETE FROM users WHERE id = ${otherUserId}::uuid`;
    });
  });

  describe('update()', () => {
    it('should update name and sqlTextEncrypted and return updated row', async () => {
      let created: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          created = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'Original Name',
            sqlTextEncrypted: 'encrypted:SELECT 6',
          });
        },
      );

      if (!created) {
        throw new Error('Expected created query');
      }
      const createdId = created.id;
      createdSavedQueryIds.push(createdId);

      let updated: SavedQuery | null | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          updated = await repo.update(createdId, {
            name: 'Updated Name',
            sqlTextEncrypted: 'encrypted:SELECT 7',
          });
        },
      );

      expect(updated).not.toBeNull();
      if (!updated) {
        throw new Error('Expected updated query');
      }
      expect(updated.id).toBe(createdId);
      expect(updated.name).toBe('Updated Name');
      expect(updated.sqlTextEncrypted).toBe('encrypted:SELECT 7');
    });

    it('should return null for nonexistent ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      let updated: SavedQuery | null | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          updated = await repo.update(fakeId, { name: 'Nope' });
        },
      );

      expect(updated).toBeNull();
    });
  });

  describe('delete()', () => {
    it('should remove row and return true', async () => {
      let created: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          created = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'Delete Me',
            sqlTextEncrypted: 'encrypted:SELECT 8',
          });
        },
      );

      if (!created) {
        throw new Error('Expected created query');
      }
      const createdId = created.id;

      let deleted: boolean | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          deleted = await repo.delete(createdId);
        },
      );

      expect(deleted).toBe(true);

      let found: SavedQuery | null | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          found = await repo.findById(createdId);
        },
      );

      expect(found).toBeNull();
    });

    it('should return false for nonexistent ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      let deleted: boolean | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          deleted = await repo.delete(fakeId);
        },
      );

      expect(deleted).toBe(false);
    });
  });

  describe('countByUser()', () => {
    it('should return accurate count', async () => {
      let q1: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          q1 = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'Count Test 1',
            sqlTextEncrypted: 'encrypted:SELECT 9',
          });
        },
      );

      if (!q1) {
        throw new Error('Expected q1');
      }
      createdSavedQueryIds.push(q1.id);

      let q2: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          q2 = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'Count Test 2',
            sqlTextEncrypted: 'encrypted:SELECT 10',
          });
        },
      );

      if (!q2) {
        throw new Error('Expected q2');
      }
      createdSavedQueryIds.push(q2.id);

      let count: number | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          count = await repo.countByUser(testUserId);
        },
      );

      expect(count).toBe(2);
    });
  });

  describe('linkToQA()', () => {
    it('should set all 4 link columns', async () => {
      let created: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          created = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'Link Test',
            sqlTextEncrypted: 'encrypted:SELECT 11',
          });
        },
      );

      if (!created) {
        throw new Error('Expected created query');
      }
      const createdId = created.id;
      createdSavedQueryIds.push(createdId);

      let linked: SavedQuery | null | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          linked = await repo.linkToQA(createdId, {
            linkedQaObjectId: 'qa-obj-1',
            linkedQaCustomerKey: 'qa-key-1',
            linkedQaName: 'My QA',
          });
        },
      );

      expect(linked).not.toBeNull();
      if (!linked) {
        throw new Error('Expected linked query');
      }
      expect(linked.linkedQaObjectId).toBe('qa-obj-1');
      expect(linked.linkedQaCustomerKey).toBe('qa-key-1');
      expect(linked.linkedQaName).toBe('My QA');
      expect(linked.linkedAt).toBeInstanceOf(Date);
    });

    it('should throw unique constraint violation when linking two queries to same QA customerKey', async () => {
      let q1: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          q1 = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'Link Test 1',
            sqlTextEncrypted: 'encrypted:SELECT 12',
          });
        },
      );

      if (!q1) {
        throw new Error('Expected q1');
      }
      createdSavedQueryIds.push(q1.id);

      let q2: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          q2 = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'Link Test 2',
            sqlTextEncrypted: 'encrypted:SELECT 13',
          });
        },
      );

      if (!q2) {
        throw new Error('Expected q2');
      }
      createdSavedQueryIds.push(q2.id);

      const q1Id = q1.id;
      const q2Id = q2.id;

      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          await repo.linkToQA(q1Id, {
            linkedQaObjectId: 'qa-obj-dup',
            linkedQaCustomerKey: 'qa-key-dup',
            linkedQaName: 'Duplicate QA',
          });
        },
      );

      let error;
      try {
        await rlsContext.runWithUserContext(
          testTenantId,
          TEST_MID,
          testUserId,
          async () => {
            await repo.linkToQA(q2Id, {
              linkedQaObjectId: 'qa-obj-dup-2',
              linkedQaCustomerKey: 'qa-key-dup',
              linkedQaName: 'Duplicate QA 2',
            });
          },
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      if (!error || typeof error !== 'object') {
        throw new Error('Expected error object');
      }

      const err = error as Error & { code?: string; cause?: { code?: string } };
      const errorCode = err.code || err.cause?.code;
      expect(errorCode).toBe('23505');
    });
  });

  describe('unlinkFromQA()', () => {
    it('should null all 4 link columns', async () => {
      let created: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          created = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'Unlink Test',
            sqlTextEncrypted: 'encrypted:SELECT 14',
          });
        },
      );

      if (!created) {
        throw new Error('Expected created query');
      }
      createdSavedQueryIds.push(created.id);

      const createdId = created.id;

      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          await repo.linkToQA(createdId, {
            linkedQaObjectId: 'qa-obj-unlink',
            linkedQaCustomerKey: 'qa-key-unlink',
            linkedQaName: 'Unlink QA',
          });
        },
      );

      let unlinked: SavedQuery | null | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          unlinked = await repo.unlinkFromQA(createdId);
        },
      );

      expect(unlinked).not.toBeNull();
      if (!unlinked) {
        throw new Error('Expected unlinked query');
      }
      expect(unlinked.linkedQaObjectId).toBeNull();
      expect(unlinked.linkedQaCustomerKey).toBeNull();
      expect(unlinked.linkedQaName).toBeNull();
      expect(unlinked.linkedAt).toBeNull();
    });
  });

  describe('findAllLinkedQaKeys()', () => {
    it('should return only rows with non-null linkedQaCustomerKey', async () => {
      let q1: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          q1 = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'Linked Query',
            sqlTextEncrypted: 'encrypted:SELECT 15',
          });
        },
      );

      if (!q1) {
        throw new Error('Expected q1');
      }
      createdSavedQueryIds.push(q1.id);

      let q2: SavedQuery | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          q2 = await repo.create({
            tenantId: testTenantId,
            mid: TEST_MID,
            userId: testUserId,
            name: 'Unlinked Query',
            sqlTextEncrypted: 'encrypted:SELECT 16',
          });
        },
      );

      if (!q2) {
        throw new Error('Expected q2');
      }
      createdSavedQueryIds.push(q2.id);

      const q1Id = q1.id;

      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          await repo.linkToQA(q1Id, {
            linkedQaObjectId: 'qa-obj-find',
            linkedQaCustomerKey: 'qa-key-find',
            linkedQaName: 'Find QA',
          });
        },
      );

      let results: LinkedQaKeyRow[] | undefined;
      await rlsContext.runWithUserContext(
        testTenantId,
        TEST_MID,
        testUserId,
        async () => {
          results = await repo.findAllLinkedQaKeys();
        },
      );

      if (!results) {
        throw new Error('Expected results');
      }
      const found = results.find(
        (r) => r.linkedQaCustomerKey === 'qa-key-find',
      );
      expect(found).toBeDefined();
      expect(found?.name).toBe('Linked Query');
      expect(found?.userId).toBe(testUserId);

      const notFound = results.find((r) => r.name === 'Unlinked Query');
      expect(notFound).toBeUndefined();
    });
  });
});
