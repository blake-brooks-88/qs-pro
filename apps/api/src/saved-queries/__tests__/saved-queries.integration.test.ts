/**
 * SavedQueriesService Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - No service mocking - behavioral assertions on DB state
 *
 * Key behaviors tested:
 * - SQL text encryption at rest
 * - RLS enforcement (user isolation)
 * - Folder FK validation
 * - Full CRUD operations
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from '@qpp/backend-shared';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { configureApp } from '../../configure-app';
import { FoldersService } from '../../folders/folders.service';
import { SavedQueriesService } from '../saved-queries.service';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_EID = 'eid-saved-queries-int';
const TEST_TSSD = 'test-saved-queries-int';
const TEST_MID = 'mid-saved-queries-int';

describe('SavedQueriesService (integration)', () => {
  let app: NestFastifyApplication;
  let savedQueriesService: SavedQueriesService;
  let foldersService: FoldersService;
  let encryptionService: EncryptionService;
  let sqlClient: Sql;

  // Test data
  let testTenantId: string;
  let testUserId: string;

  // Track created resources for cleanup
  const createdSavedQueryIds: string[] = [];
  const createdFolderIds: string[] = [];

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
    foldersService = app.get(FoldersService);
    encryptionService = app.get(EncryptionService);

    // Clean up any leftover test data from previous runs using ON CONFLICT
    // This is more robust than checking first since it handles partial state
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

    // Create or get existing test user
    const userResult = await sqlClient`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES ('sf-saved-queries-int', ${testTenantId}, 'saved-queries-int@example.com', 'Saved Queries Test User')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'Saved Queries Test User'
      RETURNING id
    `;
    const userRow = userResult[0];
    if (!userRow) {
      throw new Error('Failed to insert test user');
    }
    testUserId = userRow.id;

    // Clean up any leftover saved queries/folders from previous runs
    const reserved = await sqlClient.reserve();
    await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
    await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
    await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
    await reserved`DELETE FROM saved_queries WHERE tenant_id = ${testTenantId}::uuid`;
    await reserved`DELETE FROM folders WHERE tenant_id = ${testTenantId}::uuid`;
    await reserved`RESET app.tenant_id`;
    await reserved`RESET app.mid`;
    await reserved`RESET app.user_id`;
    reserved.release();
  }, 60000);

  afterAll(async () => {
    // Clean up saved queries (RLS protected)
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

    // Clean up folders (RLS protected)
    for (const id of createdFolderIds) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
        await reserved`DELETE FROM folders WHERE id = ${id}::uuid`;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
        reserved.release();
      } catch {
        // Best effort cleanup
      }
    }

    // Clean up user and tenant (not RLS-protected)
    if (testUserId) {
      await sqlClient`DELETE FROM users WHERE id = ${testUserId}::uuid`;
    }
    if (testTenantId) {
      await sqlClient`DELETE FROM tenants WHERE id = ${testTenantId}::uuid`;
    }

    await app.close();
  }, 30000);

  beforeEach(async () => {
    // Clean up resources before each test
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

    for (const id of [...createdFolderIds]) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
        await reserved`DELETE FROM folders WHERE id = ${id}::uuid`;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
        reserved.release();
        createdFolderIds.splice(createdFolderIds.indexOf(id), 1);
      } catch {
        // Ignore
      }
    }
  });

  /**
   * Helper to query saved query from database with proper RLS context.
   */
  async function getSavedQueryFromDb(queryId: string) {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
      await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;

      const result = await reserved`
        SELECT * FROM saved_queries WHERE id = ${queryId}::uuid
      `;

      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;

      return result[0] ?? null;
    } finally {
      reserved.release();
    }
  }

  describe('create', () => {
    it('should create saved query and encrypt SQL text', async () => {
      const sqlText = 'SELECT SubscriberKey, EmailAddress FROM _Subscribers';

      const result = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Test Query', sqlText },
      );
      createdSavedQueryIds.push(result.id);

      // Verify returned data is decrypted
      expect(result.name).toBe('Test Query');
      expect(result.sqlText).toBe(sqlText);
      expect(result.folderId).toBeNull();

      // Verify database stores encrypted SQL
      const dbRow = await getSavedQueryFromDb(result.id);
      expect(dbRow).not.toBeNull();
      if (!dbRow) {
        throw new Error('Expected saved query to exist in database');
      }

      // SQL should be encrypted (not plaintext)
      expect(dbRow.sql_text_encrypted).not.toBe(sqlText);

      // Verify we can decrypt it
      const decrypted = encryptionService.decrypt(dbRow.sql_text_encrypted);
      expect(decrypted).toBe(sqlText);
    });

    it('should create saved query in folder', async () => {
      // Create folder first
      const folder = await foldersService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Test Folder' },
      );
      createdFolderIds.push(folder.id);

      // Create query in folder
      const result = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Query in Folder', sqlText: 'SELECT 1', folderId: folder.id },
      );
      createdSavedQueryIds.push(result.id);

      expect(result.folderId).toBe(folder.id);
    });

    it('should reject invalid folder ID', async () => {
      const invalidFolderId = '00000000-0000-0000-0000-000000000000';

      await expect(
        savedQueriesService.create(testTenantId, TEST_MID, testUserId, {
          name: 'Bad Folder Query',
          sqlText: 'SELECT 1',
          folderId: invalidFolderId,
        }),
      ).rejects.toMatchObject({
        code: 'RESOURCE_NOT_FOUND',
      });
    });
  });

  describe('findAll', () => {
    it('should return decrypted queries', async () => {
      const sqlText = 'SELECT Name FROM DataExtension';

      await savedQueriesService.create(testTenantId, TEST_MID, testUserId, {
        name: 'List Test Query',
        sqlText,
      });

      const results = await savedQueriesService.findAll(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      expect(results.length).toBeGreaterThan(0);
      const query = results.find((q) => q.name === 'List Test Query');
      expect(query).toBeDefined();
      if (query) {
        createdSavedQueryIds.push(query.id);
        expect(query.sqlText).toBe(sqlText);
      }
    });

    it('should enforce RLS - queries visible to other users in same BU', async () => {
      // RLS is now tenant_id + mid scoped (broadened for linking).
      // Users in the same BU can see each other's queries.
      const created = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'My Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(created.id);

      // List with different user ID in same tenant + mid — should still be visible
      const otherUserId = crypto.randomUUID();
      const results = await savedQueriesService.findAll(
        testTenantId,
        TEST_MID,
        otherUserId,
      );

      const found = results.find((q) => q.id === created.id);
      expect(found).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should return decrypted query', async () => {
      const sqlText = 'SELECT * FROM _Job';

      const created = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'FindById Test', sqlText },
      );
      createdSavedQueryIds.push(created.id);

      const found = await savedQueriesService.findById(
        testTenantId,
        TEST_MID,
        testUserId,
        created.id,
      );

      expect(found.id).toBe(created.id);
      expect(found.name).toBe('FindById Test');
      expect(found.sqlText).toBe(sqlText);
    });

    it('should throw RESOURCE_NOT_FOUND for non-existent query', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(
        savedQueriesService.findById(
          testTenantId,
          TEST_MID,
          testUserId,
          fakeId,
        ),
      ).rejects.toMatchObject({
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should enforce RLS - query visible to other users in same BU', async () => {
      // RLS is now tenant_id + mid scoped (broadened for linking).
      const created = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'BU Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(created.id);

      // Access with different user ID in same tenant + mid — should succeed
      const otherUserId = crypto.randomUUID();

      const found = await savedQueriesService.findById(
        testTenantId,
        TEST_MID,
        otherUserId,
        created.id,
      );

      expect(found.id).toBe(created.id);
      expect(found.name).toBe('BU Query');
    });
  });

  describe('update', () => {
    it('should update name and re-encrypt SQL', async () => {
      const originalSql = 'SELECT Original FROM Test';
      const newSql = 'SELECT Updated FROM Test';

      const created = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Original Name', sqlText: originalSql },
      );
      createdSavedQueryIds.push(created.id);

      const updated = await savedQueriesService.update(
        testTenantId,
        TEST_MID,
        testUserId,
        created.id,
        { name: 'Updated Name', sqlText: newSql },
      );

      expect(updated.name).toBe('Updated Name');
      expect(updated.sqlText).toBe(newSql);

      // Verify database has new encrypted SQL
      const dbRow = await getSavedQueryFromDb(created.id);
      expect(dbRow).not.toBeNull();
      if (!dbRow) {
        throw new Error('Expected saved query to exist');
      }

      const decrypted = encryptionService.decrypt(dbRow.sql_text_encrypted);
      expect(decrypted).toBe(newSql);
    });

    it('should move query to folder', async () => {
      const created = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Move Test', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(created.id);

      // Create folder
      const folder = await foldersService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Target Folder' },
      );
      createdFolderIds.push(folder.id);

      // Move query to folder
      const updated = await savedQueriesService.update(
        testTenantId,
        TEST_MID,
        testUserId,
        created.id,
        { folderId: folder.id },
      );

      expect(updated.folderId).toBe(folder.id);
    });

    it('should reject invalid folder ID', async () => {
      const created = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Update Fail Test', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(created.id);

      await expect(
        savedQueriesService.update(
          testTenantId,
          TEST_MID,
          testUserId,
          created.id,
          {
            folderId: '00000000-0000-0000-0000-000000000000',
          },
        ),
      ).rejects.toMatchObject({
        code: 'RESOURCE_NOT_FOUND',
      });
    });
  });

  describe('delete', () => {
    it('should delete saved query', async () => {
      const created = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Delete Test', sqlText: 'SELECT 1' },
      );

      await savedQueriesService.delete(
        testTenantId,
        TEST_MID,
        testUserId,
        created.id,
      );

      // Verify deleted
      await expect(
        savedQueriesService.findById(
          testTenantId,
          TEST_MID,
          testUserId,
          created.id,
        ),
      ).rejects.toMatchObject({
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw RESOURCE_NOT_FOUND for non-existent query', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(
        savedQueriesService.delete(testTenantId, TEST_MID, testUserId, fakeId),
      ).rejects.toMatchObject({
        code: 'RESOURCE_NOT_FOUND',
      });
    });
  });

  describe('countByUser', () => {
    it('should return count of user queries', async () => {
      // Create two queries
      const q1 = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Count Test 1', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(q1.id);

      const q2 = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Count Test 2', sqlText: 'SELECT 2' },
      );
      createdSavedQueryIds.push(q2.id);

      const count = await savedQueriesService.countByUser(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      expect(count).toBe(2);
    });

    it('should enforce RLS - count includes all BU queries after RLS broadening', async () => {
      // RLS is now tenant_id + mid scoped (broadened for linking).
      // countByUser counts all queries in the BU visible to the RLS policy.
      const created = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'RLS Count Test', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(created.id);

      // Count for different user in same BU should see the query
      const otherUserId = crypto.randomUUID();
      const count = await savedQueriesService.countByUser(
        testTenantId,
        TEST_MID,
        otherUserId,
      );

      expect(count).toBeGreaterThanOrEqual(1);
    });
  });
});
