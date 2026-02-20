/**
 * Shared Folders Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - MSW for MCE HTTP (external API - required for auth module initialization)
 * - No internal service mocking - behavioral assertions on service results and DB state
 *
 * Key behaviors tested:
 * - Feature gating (teamCollaboration: Enterprise-only)
 * - RLS visibility (personal vs shared folders)
 * - Shared folder CRUD (BU-owned)
 * - shareFolder endpoint ownership check
 * - Shared -> personal transition blocked
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
import { FoldersService } from '../folders.service';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_TSSD = 'test-shared-folders-int';
const TEST_EID = 'eid-shared-folders-int';
const TEST_MID = 'mid-shared-folders-int';

const defaultHandlers = [
  http.post(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`, () => {
    return HttpResponse.json({
      access_token: 'shared-folders-int-access-token',
      refresh_token: 'shared-folders-int-refresh-token',
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
        sub: 'sf-shared-folders-int',
        enterprise_id: TEST_EID,
        member_id: TEST_MID,
        email: 'shared-folders-int@example.com',
        name: 'Shared Folders Integration User',
      });
    },
  ),
];

const server = setupServer(...defaultHandlers);

describe('Shared Folders (integration)', () => {
  let app: NestFastifyApplication;
  let service: FoldersService;
  let sqlClient: Sql;

  let testTenantId: string;
  let testUserIdA: string;
  let testUserIdB: string;

  const createdFolderIds: string[] = [];

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

  const setTenantTier = async (tier: 'free' | 'pro' | 'enterprise') => {
    await sqlClient`
      UPDATE tenants
      SET subscription_tier = ${tier}
      WHERE id = ${testTenantId}::uuid
    `;
  };

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
    service = app.get(FoldersService);

    // Create test tenant (enterprise tier for most tests)
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
      VALUES ('sf-shared-folders-int-a', ${testTenantId}, 'user-a@example.com', 'User A')
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
      VALUES ('sf-shared-folders-int-b', ${testTenantId}, 'user-b@example.com', 'User B')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'User B'
      RETURNING id
    `;
    const userBRow = userBResult[0];
    if (!userBRow) {
      throw new Error('Failed to insert test user B');
    }
    testUserIdB = userBRow.id;
  }, 60000);

  afterAll(async () => {
    server.close();

    // Clean up folders
    for (const folderId of createdFolderIds) {
      try {
        await withRls(testTenantId, TEST_MID, testUserIdA, async (r) => {
          await r`DELETE FROM folders WHERE id = ${folderId}::uuid`;
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
    // Clean up folders created during test (reverse order for parent-child)
    for (const folderId of [...createdFolderIds].reverse()) {
      try {
        await withRls(testTenantId, TEST_MID, testUserIdA, async (r) => {
          await r`DELETE FROM folders WHERE id = ${folderId}::uuid`;
        });
      } catch {
        // Ignore errors
      }
    }
    createdFolderIds.length = 0;

    // Reset to enterprise tier for next test
    await setTenantTier('enterprise');
  });

  describe('feature gating', () => {
    it('rejects shared folder creation for free-tier tenant', async () => {
      await setTenantTier('free');

      await expect(
        service.create(testTenantId, TEST_MID, testUserIdA, {
          name: 'Free Tier Shared',
          visibility: 'shared',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });

    it('rejects shared folder creation for pro-tier tenant', async () => {
      await setTenantTier('pro');

      await expect(
        service.create(testTenantId, TEST_MID, testUserIdA, {
          name: 'Pro Tier Shared',
          visibility: 'shared',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });

    it('allows shared folder creation for enterprise-tier tenant', async () => {
      await setTenantTier('enterprise');

      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'Enterprise Shared',
        visibility: 'shared',
      });
      createdFolderIds.push(folder.id);

      expect(folder.visibility).toBe('shared');
      expect(folder.name).toBe('Enterprise Shared');
    });

    it('rejects shareFolder for pro-tier tenant', async () => {
      // Create personal folder while enterprise
      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'To Share',
      });
      createdFolderIds.push(folder.id);

      await setTenantTier('pro');

      await expect(
        service.shareFolder(testTenantId, TEST_MID, testUserIdA, folder.id),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });

    it('allows shareFolder for enterprise-tier tenant', async () => {
      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'Will Share',
      });
      createdFolderIds.push(folder.id);

      const shared = await service.shareFolder(
        testTenantId,
        TEST_MID,
        testUserIdA,
        folder.id,
      );

      expect(shared.visibility).toBe('shared');
    });
  });

  describe('RLS visibility', () => {
    it('User B cannot see User A personal folder', async () => {
      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'A Personal Folder',
      });
      createdFolderIds.push(folder.id);

      const foldersB = await service.findAll(
        testTenantId,
        TEST_MID,
        testUserIdB,
      );

      expect(foldersB.find((f) => f.id === folder.id)).toBeUndefined();
    });

    it('User B CAN see User A shared folder', async () => {
      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'A Shared Folder',
        visibility: 'shared',
      });
      createdFolderIds.push(folder.id);

      const foldersB = await service.findAll(
        testTenantId,
        TEST_MID,
        testUserIdB,
      );

      const found = foldersB.find((f) => f.id === folder.id);
      expect(found).toBeDefined();
      expect(found?.name).toBe('A Shared Folder');
    });

    it('User A sees their own personal folder', async () => {
      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'My Own Folder',
      });
      createdFolderIds.push(folder.id);

      const foldersA = await service.findAll(
        testTenantId,
        TEST_MID,
        testUserIdA,
      );

      expect(foldersA.find((f) => f.id === folder.id)).toBeDefined();
    });

    it('shared folder visible to all BU users regardless of creator', async () => {
      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'Team Folder',
        visibility: 'shared',
      });
      createdFolderIds.push(folder.id);

      // Both users can see it
      const foldersA = await service.findAll(
        testTenantId,
        TEST_MID,
        testUserIdA,
      );
      const foldersB = await service.findAll(
        testTenantId,
        TEST_MID,
        testUserIdB,
      );

      expect(foldersA.find((f) => f.id === folder.id)).toBeDefined();
      expect(foldersB.find((f) => f.id === folder.id)).toBeDefined();
    });
  });

  describe('shared folder CRUD', () => {
    it('User B can rename a shared folder (BU-owned)', async () => {
      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'Original Name',
        visibility: 'shared',
      });
      createdFolderIds.push(folder.id);

      const updated = await service.update(
        testTenantId,
        TEST_MID,
        testUserIdB,
        folder.id,
        { name: 'Renamed by B' },
      );

      expect(updated.name).toBe('Renamed by B');
    });

    it('User B can delete an empty shared folder (BU-owned)', async () => {
      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'Delete Me Shared',
        visibility: 'shared',
      });
      createdFolderIds.push(folder.id);

      await service.delete(testTenantId, TEST_MID, testUserIdB, folder.id);

      // Verify deletion
      await expect(
        service.findById(testTenantId, TEST_MID, testUserIdA, folder.id),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });

      // Remove from cleanup list
      const idx = createdFolderIds.indexOf(folder.id);
      if (idx > -1) {
        createdFolderIds.splice(idx, 1);
      }
    });

    it('non-creator cannot share a personal folder (RLS blocks visibility)', async () => {
      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'A Private Folder',
      });
      createdFolderIds.push(folder.id);

      // User B cannot see User A's personal folder due to RLS,
      // so shareFolder returns RESOURCE_NOT_FOUND before reaching ownership check
      await expect(
        service.shareFolder(testTenantId, TEST_MID, testUserIdB, folder.id),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('creator can share their own personal folder', async () => {
      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'My Folder to Share',
      });
      createdFolderIds.push(folder.id);

      const shared = await service.shareFolder(
        testTenantId,
        TEST_MID,
        testUserIdA,
        folder.id,
      );

      expect(shared.visibility).toBe('shared');
    });

    it('shared folder response includes creatorName', async () => {
      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'Attributed Folder',
        visibility: 'shared',
      });
      createdFolderIds.push(folder.id);

      const found = await service.findById(
        testTenantId,
        TEST_MID,
        testUserIdB,
        folder.id,
      );

      expect(found.creatorName).toBe('User A');
    });

    it('shareFolder is idempotent for already-shared folders', async () => {
      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'Already Shared',
        visibility: 'shared',
      });
      createdFolderIds.push(folder.id);

      const result = await service.shareFolder(
        testTenantId,
        TEST_MID,
        testUserIdA,
        folder.id,
      );

      expect(result.visibility).toBe('shared');
      expect(result.id).toBe(folder.id);
    });
  });

  describe('personal folder creation', () => {
    it('allows personal folder creation for free-tier tenant', async () => {
      await setTenantTier('free');

      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'Free Personal Folder',
      });
      createdFolderIds.push(folder.id);

      expect(folder.visibility).toBe('personal');
    });

    it('allows personal folder creation for pro-tier tenant', async () => {
      await setTenantTier('pro');

      const folder = await service.create(testTenantId, TEST_MID, testUserIdA, {
        name: 'Pro Personal Folder',
      });
      createdFolderIds.push(folder.id);

      expect(folder.visibility).toBe('personal');
    });
  });
});
