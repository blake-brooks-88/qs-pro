/**
 * FoldersService Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - MSW for MCE HTTP (external API - required for auth module initialization)
 * - No internal service mocking - behavioral assertions on service results and DB state
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
import { SavedQueriesService } from '../../saved-queries/saved-queries.service';
import { FoldersService } from '../folders.service';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_TSSD = 'test-folders-int';

// MSW handlers for auth endpoints (required for app initialization)
const defaultHandlers = [
  http.post(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`, () => {
    return HttpResponse.json({
      access_token: 'folders-int-access-token',
      refresh_token: 'folders-int-refresh-token',
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
        sub: 'sf-folders-int',
        enterprise_id: 'eid-folders-int',
        member_id: 'mid-folders-int',
        email: 'folders-int@example.com',
        name: 'Folders Integration User',
      });
    },
  ),
];

const server = setupServer(...defaultHandlers);

describe('FoldersService (integration)', () => {
  let app: NestFastifyApplication;
  let service: FoldersService;
  let sqlClient: Sql;

  // Test data
  let testTenantId: string;
  let testUserId: string;
  const testMid = 'mid-folders-int';
  const testEid = 'eid-folders-int';

  // Track created entities for cleanup
  const createdFolderIds: string[] = [];
  const createdSavedQueryIds: string[] = [];

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
    service = app.get(FoldersService);

    // Create test tenant and user directly in DB
    const tenantResult =
      await sqlClient`INSERT INTO tenants (eid, tssd) VALUES (${testEid}, ${TEST_TSSD}) RETURNING id`;
    const tenantRow = tenantResult[0];
    if (!tenantRow) {
      throw new Error('Failed to insert test tenant');
    }
    testTenantId = tenantRow.id;

    const userResult = await sqlClient`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES ('sf-folders-int', ${testTenantId}, 'folders-int@example.com', 'Folders Integration User')
      RETURNING id
    `;
    const userRow = userResult[0];
    if (!userRow) {
      throw new Error('Failed to insert test user');
    }
    testUserId = userRow.id;
  }, 60000);

  afterAll(async () => {
    server.close();

    // Clean up folders using reserved connection with RLS context
    for (const folderId of createdFolderIds) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${testMid}, false)`;
        await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
        await reserved`DELETE FROM folders WHERE id = ${folderId}::uuid`;
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

  beforeEach(() => {
    server.resetHandlers();
  });

  afterEach(async () => {
    // Clean up saved queries first (before folders due to FK constraint)
    for (const savedQueryId of createdSavedQueryIds) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${testMid}, false)`;
        await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
        await reserved`DELETE FROM saved_queries WHERE id = ${savedQueryId}::uuid`;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
        reserved.release();
      } catch {
        // Best effort cleanup
      }
    }
    createdSavedQueryIds.length = 0;

    // Clean up folders created during test (reverse order for parent-child relationships)
    for (const folderId of [...createdFolderIds].reverse()) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${testMid}, false)`;
        await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
        await reserved`DELETE FROM folders WHERE id = ${folderId}::uuid`;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
        reserved.release();
      } catch {
        // Ignore errors (folder might have children or not exist)
      }
    }
    createdFolderIds.length = 0;
  });

  describe('create', () => {
    it('creates a folder with name only', async () => {
      const folder = await service.create(testTenantId, testMid, testUserId, {
        name: 'Test Folder',
      });
      createdFolderIds.push(folder.id);

      expect(folder).toMatchObject({
        name: 'Test Folder',
        parentId: null,
        tenantId: testTenantId,
        mid: testMid,
        userId: testUserId,
      });
      expect(folder.id).toBeDefined();
      expect(folder.createdAt).toBeInstanceOf(Date);
      expect(folder.updatedAt).toBeInstanceOf(Date);
    });

    it('creates a nested folder with parentId', async () => {
      // Create parent folder
      const parent = await service.create(testTenantId, testMid, testUserId, {
        name: 'Parent Folder',
      });
      createdFolderIds.push(parent.id);

      // Create child folder
      const child = await service.create(testTenantId, testMid, testUserId, {
        name: 'Child Folder',
        parentId: parent.id,
      });
      createdFolderIds.push(child.id);

      expect(child.parentId).toBe(parent.id);
    });

    it('rejects non-existent parentId', async () => {
      const fakeParentId = crypto.randomUUID();

      await expect(
        service.create(testTenantId, testMid, testUserId, {
          name: 'Orphan Folder',
          parentId: fakeParentId,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });
  });

  describe('findAll', () => {
    it('returns empty array when no folders exist', async () => {
      const folders = await service.findAll(testTenantId, testMid, testUserId);
      expect(folders).toEqual([]);
    });

    it('returns all folders for user', async () => {
      const folder1 = await service.create(testTenantId, testMid, testUserId, {
        name: 'Folder 1',
      });
      createdFolderIds.push(folder1.id);

      const folder2 = await service.create(testTenantId, testMid, testUserId, {
        name: 'Folder 2',
      });
      createdFolderIds.push(folder2.id);

      const folders = await service.findAll(testTenantId, testMid, testUserId);
      expect(folders).toHaveLength(2);
      expect(folders.map((f) => f.name).sort()).toEqual(
        ['Folder 1', 'Folder 2'].sort(),
      );
    });

    it('enforces RLS - does not return other user folders', async () => {
      // Create folder for test user
      const folder = await service.create(testTenantId, testMid, testUserId, {
        name: 'My Folder',
      });
      createdFolderIds.push(folder.id);

      // Try to find with different user ID
      const otherUserId = crypto.randomUUID();
      const folders = await service.findAll(testTenantId, testMid, otherUserId);

      // RLS should prevent access
      expect(folders).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns folder by ID', async () => {
      const created = await service.create(testTenantId, testMid, testUserId, {
        name: 'Find Me',
      });
      createdFolderIds.push(created.id);

      const found = await service.findById(
        testTenantId,
        testMid,
        testUserId,
        created.id,
      );

      expect(found.id).toBe(created.id);
      expect(found.name).toBe('Find Me');
    });

    it('throws RESOURCE_NOT_FOUND for non-existent folder', async () => {
      const fakeId = crypto.randomUUID();

      await expect(
        service.findById(testTenantId, testMid, testUserId, fakeId),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('enforces RLS - throws for other user folder', async () => {
      const created = await service.create(testTenantId, testMid, testUserId, {
        name: 'Private Folder',
      });
      createdFolderIds.push(created.id);

      // Try to access with different user ID
      const otherUserId = crypto.randomUUID();
      await expect(
        service.findById(testTenantId, testMid, otherUserId, created.id),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });
  });

  describe('update', () => {
    it('updates folder name', async () => {
      const created = await service.create(testTenantId, testMid, testUserId, {
        name: 'Original Name',
      });
      createdFolderIds.push(created.id);

      const updated = await service.update(
        testTenantId,
        testMid,
        testUserId,
        created.id,
        { name: 'Updated Name' },
      );

      expect(updated.name).toBe('Updated Name');
      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        created.updatedAt.getTime(),
      );
    });

    it('updates parentId', async () => {
      const parent = await service.create(testTenantId, testMid, testUserId, {
        name: 'New Parent',
      });
      createdFolderIds.push(parent.id);

      const child = await service.create(testTenantId, testMid, testUserId, {
        name: 'Child',
      });
      createdFolderIds.push(child.id);

      const updated = await service.update(
        testTenantId,
        testMid,
        testUserId,
        child.id,
        { parentId: parent.id },
      );

      expect(updated.parentId).toBe(parent.id);
    });

    it('prevents circular reference (self as parent)', async () => {
      const folder = await service.create(testTenantId, testMid, testUserId, {
        name: 'Folder',
      });
      createdFolderIds.push(folder.id);

      await expect(
        service.update(testTenantId, testMid, testUserId, folder.id, {
          parentId: folder.id,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
    });

    it('prevents circular reference through ancestry', async () => {
      const grandparent = await service.create(
        testTenantId,
        testMid,
        testUserId,
        { name: 'Grandparent' },
      );
      createdFolderIds.push(grandparent.id);

      const parent = await service.create(testTenantId, testMid, testUserId, {
        name: 'Parent',
        parentId: grandparent.id,
      });
      createdFolderIds.push(parent.id);

      const child = await service.create(testTenantId, testMid, testUserId, {
        name: 'Child',
        parentId: parent.id,
      });
      createdFolderIds.push(child.id);

      await expect(
        service.update(testTenantId, testMid, testUserId, grandparent.id, {
          parentId: child.id,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
    });

    it('throws RESOURCE_NOT_FOUND for non-existent folder', async () => {
      const fakeId = crypto.randomUUID();

      await expect(
        service.update(testTenantId, testMid, testUserId, fakeId, {
          name: 'Test',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });
  });

  describe('delete', () => {
    it('deletes an empty folder', async () => {
      const folder = await service.create(testTenantId, testMid, testUserId, {
        name: 'To Delete',
      });
      createdFolderIds.push(folder.id);

      await service.delete(testTenantId, testMid, testUserId, folder.id);

      // Verify deletion
      await expect(
        service.findById(testTenantId, testMid, testUserId, folder.id),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });

      // Remove from cleanup list since it's deleted
      const idx = createdFolderIds.indexOf(folder.id);
      if (idx > -1) {
        createdFolderIds.splice(idx, 1);
      }
    });

    it('rejects deletion of folder with child folders', async () => {
      const parent = await service.create(testTenantId, testMid, testUserId, {
        name: 'Parent',
      });
      createdFolderIds.push(parent.id);

      const child = await service.create(testTenantId, testMid, testUserId, {
        name: 'Child',
        parentId: parent.id,
      });
      createdFolderIds.push(child.id);

      await expect(
        service.delete(testTenantId, testMid, testUserId, parent.id),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
    });

    it('rejects deletion of folder with saved queries', async () => {
      const savedQueriesService = app.get(SavedQueriesService);

      const folder = await service.create(testTenantId, testMid, testUserId, {
        name: 'Folder with Query',
      });
      createdFolderIds.push(folder.id);

      const savedQuery = await savedQueriesService.create(
        testTenantId,
        testMid,
        testUserId,
        {
          name: 'Test Query',
          sqlText: 'SELECT 1',
          folderId: folder.id,
        },
      );
      createdSavedQueryIds.push(savedQuery.id);

      await expect(
        service.delete(testTenantId, testMid, testUserId, folder.id),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
    });

    it('throws RESOURCE_NOT_FOUND for non-existent folder', async () => {
      const fakeId = crypto.randomUUID();

      await expect(
        service.delete(testTenantId, testMid, testUserId, fakeId),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });
  });
});
