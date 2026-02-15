/**
 * Query Activities Unlink Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - MCE services mocked (QueryDefinitionService boundary)
 * - SessionGuard and CsrfGuard overridden for direct HTTP testing
 *
 * Key behaviors tested:
 * - Full unlink lifecycle: link then unlink clears DB state
 * - deleteLocal removes saved query from DB
 * - deleteRemote invokes SOAP deletion via mocked boundary
 * - Feature gating (free tier -> 403)
 * - RLS isolation (cross-tenant cannot unlink)
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DataExtensionService,
  MceBridgeService,
  MetadataService,
  QueryDefinitionService,
  SessionGuard,
} from '@qpp/backend-shared';
import type { Sql } from 'postgres';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppModule } from '../../app.module';
import { CsrfGuard } from '../../auth/csrf.guard';
import { configureApp } from '../../configure-app';
import { SavedQueriesService } from '../../saved-queries/saved-queries.service';

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_EID = 'eid-qa-unlink-int';
const TEST_TSSD = 'test-qa-unlink-int';
const TEST_MID = 'mid-qa-unlink-int';

const TEST_EID_2 = 'eid-qa-unlink-int-2';
const TEST_TSSD_2 = 'test-qa-unlink-int-2';
const TEST_MID_2 = 'mid-qa-unlink-int-2';

describe('DELETE /query-activities/link/:savedQueryId (integration)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;
  let savedQueriesService: SavedQueriesService;

  let testTenantId: string;
  let testUserId: string;

  let testTenantId2: string;
  let testUserId2: string;

  const createdSavedQueryIds: string[] = [];

  const mockQDService = {
    retrieveAll: vi.fn().mockResolvedValue([]),
    retrieveDetail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ objectId: 'qa-obj-1' }),
    retrieve: vi.fn().mockResolvedValue(null),
    retrieveByNameAndFolder: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  const mockDEService = {
    retrieveByCustomerKey: vi.fn(),
  };

  const mockMetadataService = {
    getFields: vi.fn(),
  };

  const mockMceBridge = {
    request: vi.fn().mockResolvedValue({}),
  };

  const mockSessionUser = {
    userId: '',
    tenantId: '',
    mid: TEST_MID,
  };

  const setTenantTier = async (
    tenantId: string,
    tier: 'free' | 'pro' | 'enterprise',
  ) => {
    await sqlClient`
      UPDATE tenants
      SET subscription_tier = ${tier}
      WHERE id = ${tenantId}::uuid
    `;
  };

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

  async function createTestTenant(
    eid: string,
    tssd: string,
    tier: string,
  ): Promise<string> {
    const result = await sqlClient`
      INSERT INTO tenants (eid, tssd, subscription_tier)
      VALUES (${eid}, ${tssd}, ${tier})
      ON CONFLICT (eid) DO UPDATE SET tssd = ${tssd}, subscription_tier = ${tier}
      RETURNING id
    `;
    const row = result[0];
    if (!row) {
      throw new Error('Failed to insert test tenant');
    }
    return row.id;
  }

  async function createTestUser(
    sfUserId: string,
    tenantId: string,
    email: string,
    name: string,
  ): Promise<string> {
    const result = await sqlClient`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES (${sfUserId}, ${tenantId}, ${email}, ${name})
      ON CONFLICT (sf_user_id) DO UPDATE SET name = ${name}
      RETURNING id
    `;
    const row = result[0];
    if (!row) {
      throw new Error('Failed to insert test user');
    }
    return row.id;
  }

  async function createLinkedSavedQuery(
    tenantId: string,
    mid: string,
    userId: string,
    name: string,
    qaObjectId: string,
    qaCustomerKey: string,
  ) {
    const result = await savedQueriesService.create(tenantId, mid, userId, {
      name,
      sqlText: 'SELECT 1',
    });
    createdSavedQueryIds.push(result.id);

    await savedQueriesService.linkToQA(tenantId, mid, userId, result.id, {
      linkedQaObjectId: qaObjectId,
      linkedQaCustomerKey: qaCustomerKey,
      linkedQaName: name,
    });

    return result;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(SessionGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = { ...mockSessionUser };
          return true;
        },
      })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(QueryDefinitionService)
      .useValue(mockQDService)
      .overrideProvider(DataExtensionService)
      .useValue(mockDEService)
      .overrideProvider(MetadataService)
      .useValue(mockMetadataService)
      .overrideProvider(MceBridgeService)
      .useValue(mockMceBridge)
      .compile();

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

    testTenantId = await createTestTenant(TEST_EID, TEST_TSSD, 'pro');
    testUserId = await createTestUser(
      'sf-qa-unlink-int',
      testTenantId,
      'qa-unlink-int@example.com',
      'QA Unlink Test User',
    );

    testTenantId2 = await createTestTenant(TEST_EID_2, TEST_TSSD_2, 'pro');
    testUserId2 = await createTestUser(
      'sf-qa-unlink-int-2',
      testTenantId2,
      'qa-unlink-int-2@example.com',
      'QA Unlink Test User 2',
    );

    mockSessionUser.userId = testUserId;
    mockSessionUser.tenantId = testTenantId;

    await withRls(testTenantId, TEST_MID, testUserId, async (r) => {
      await r`DELETE FROM saved_queries WHERE tenant_id = ${testTenantId}::uuid`;
    });
    await withRls(testTenantId2, TEST_MID_2, testUserId2, async (r) => {
      await r`DELETE FROM saved_queries WHERE tenant_id = ${testTenantId2}::uuid`;
    });
  }, 60000);

  afterAll(async () => {
    for (const id of createdSavedQueryIds) {
      try {
        await withRls(testTenantId, TEST_MID, testUserId, async (r) => {
          await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
        });
      } catch {
        try {
          await withRls(testTenantId2, TEST_MID_2, testUserId2, async (r) => {
            await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
          });
        } catch {
          // best effort
        }
      }
    }

    if (testUserId) {
      await sqlClient`DELETE FROM users WHERE id = ${testUserId}::uuid`;
    }
    if (testUserId2) {
      await sqlClient`DELETE FROM users WHERE id = ${testUserId2}::uuid`;
    }
    if (testTenantId) {
      await sqlClient`DELETE FROM tenants WHERE id = ${testTenantId}::uuid`;
    }
    if (testTenantId2) {
      await sqlClient`DELETE FROM tenants WHERE id = ${testTenantId2}::uuid`;
    }

    await app.close();
  }, 30000);

  beforeEach(async () => {
    for (const id of [...createdSavedQueryIds]) {
      try {
        await withRls(testTenantId, TEST_MID, testUserId, async (r) => {
          await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
        });
        createdSavedQueryIds.splice(createdSavedQueryIds.indexOf(id), 1);
      } catch {
        try {
          await withRls(testTenantId2, TEST_MID_2, testUserId2, async (r) => {
            await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
          });
          createdSavedQueryIds.splice(createdSavedQueryIds.indexOf(id), 1);
        } catch {
          // Ignore
        }
      }
    }

    mockSessionUser.userId = testUserId;
    mockSessionUser.tenantId = testTenantId;
    mockSessionUser.mid = TEST_MID;

    vi.clearAllMocks();
    mockQDService.delete.mockResolvedValue(undefined);
  });

  it('full unlink lifecycle: link then unlink clears link columns in DB', async () => {
    // Arrange
    const query = await createLinkedSavedQuery(
      testTenantId,
      TEST_MID,
      testUserId,
      'Lifecycle Unlink Query',
      'qa-obj-lifecycle',
      'qa-key-lifecycle',
    );

    // Act
    const res = await request(app.getHttpServer()).delete(
      `/query-activities/link/${query.id}`,
    );

    // Assert — HTTP response
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // Assert — DB state: link columns cleared
    const afterUnlink = await savedQueriesService.findById(
      testTenantId,
      TEST_MID,
      testUserId,
      query.id,
    );
    expect(afterUnlink.linkedQaObjectId).toBeNull();
    expect(afterUnlink.linkedQaCustomerKey).toBeNull();
    expect(afterUnlink.linkedQaName).toBeNull();
    expect(afterUnlink.linkedAt).toBeNull();
  });

  it('unlink with deleteLocal removes saved query from DB', async () => {
    // Arrange
    const query = await createLinkedSavedQuery(
      testTenantId,
      TEST_MID,
      testUserId,
      'Delete Local Query',
      'qa-obj-del-local',
      'qa-key-del-local',
    );

    // Act
    const res = await request(app.getHttpServer())
      .delete(`/query-activities/link/${query.id}`)
      .send({ deleteLocal: true });

    // Assert — HTTP response
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // Assert — saved query no longer exists in DB
    await expect(
      savedQueriesService.findById(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('unlink with deleteRemote invokes SOAP delete on MCE boundary', async () => {
    // Arrange
    const query = await createLinkedSavedQuery(
      testTenantId,
      TEST_MID,
      testUserId,
      'Delete Remote Query',
      'qa-obj-del-remote',
      'qa-key-del-remote',
    );

    // Act
    const res = await request(app.getHttpServer())
      .delete(`/query-activities/link/${query.id}`)
      .send({ deleteRemote: true });

    // Assert — HTTP response
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // Assert — SOAP delete was called with the captured objectId
    expect(mockQDService.delete).toHaveBeenCalledWith(
      testTenantId,
      testUserId,
      TEST_MID,
      'qa-obj-del-remote',
    );

    // Assert — saved query still exists (only remote deleted)
    const afterUnlink = await savedQueriesService.findById(
      testTenantId,
      TEST_MID,
      testUserId,
      query.id,
    );
    expect(afterUnlink.linkedQaObjectId).toBeNull();
  });

  it('returns 403 when deploy feature is disabled (free tier)', async () => {
    // Arrange
    await setTenantTier(testTenantId, 'free');

    // Act
    const res = await request(app.getHttpServer()).delete(
      '/query-activities/link/fake-id',
    );

    // Assert
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FEATURE_NOT_ENABLED');

    // Cleanup — restore pro tier
    await setTenantTier(testTenantId, 'pro');
  });

  it('RLS isolation: cross-tenant session cannot unlink another tenant query', async () => {
    // Arrange — create query under tenant 1
    const query = await createLinkedSavedQuery(
      testTenantId,
      TEST_MID,
      testUserId,
      'Tenant 1 Isolated Query',
      'qa-obj-rls-iso',
      'qa-key-rls-iso',
    );

    // Switch session to tenant 2
    mockSessionUser.userId = testUserId2;
    mockSessionUser.tenantId = testTenantId2;
    mockSessionUser.mid = TEST_MID_2;

    // Act — attempt to unlink with tenant 2 session
    const res = await request(app.getHttpServer()).delete(
      `/query-activities/link/${query.id}`,
    );

    // Assert — RLS blocks access (404 or 500 from findById failing)
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Restore session to tenant 1 for cleanup
    mockSessionUser.userId = testUserId;
    mockSessionUser.tenantId = testTenantId;
    mockSessionUser.mid = TEST_MID;

    // Verify query still linked under tenant 1
    const stillLinked = await savedQueriesService.findById(
      testTenantId,
      TEST_MID,
      testUserId,
      query.id,
    );
    expect(stillLinked.linkedQaObjectId).toBe('qa-obj-rls-iso');
  });
});
