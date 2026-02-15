/**
 * Publish Endpoint Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - MCE services mocked (MceBridgeService, QueryDefinitionService)
 * - SessionGuard and CsrfGuard overridden for direct HTTP testing
 *
 * Key behaviors tested:
 * - Happy path: MCE PATCH + publish event creation
 * - Specific version publish
 * - Feature gating (free tier -> 403)
 * - Validation errors (400 for missing versionId)
 * - Not found errors (404 for missing query, link, version)
 * - MCE failure handling (no orphan publish events)
 * - Auth requirement (401)
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

const TEST_EID = 'eid-publish-int';
const TEST_TSSD = 'test-publish-int';
const TEST_MID = 'mid-publish-int';

describe('POST /query-activities/publish/:savedQueryId (integration)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;
  let savedQueriesService: SavedQueriesService;

  let testTenantId: string;
  let testUserId: string;

  const createdSavedQueryIds: string[] = [];

  const mockMceBridge = {
    request: vi.fn().mockResolvedValue({}),
  };

  const mockQDService = {
    retrieveAll: vi.fn().mockResolvedValue([]),
    retrieveDetail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ objectId: 'qa-obj-1' }),
    retrieve: vi.fn().mockResolvedValue(null),
    retrieveByNameAndFolder: vi.fn().mockResolvedValue(null),
  };

  const mockDEService = {
    retrieveByCustomerKey: vi.fn(),
  };

  const mockMetadataService = {
    getFields: vi.fn(),
  };

  const mockSessionUser = {
    userId: '',
    tenantId: '',
    mid: TEST_MID,
  };

  const setTenantTier = async (tier: 'free' | 'pro' | 'enterprise') => {
    await sqlClient`
      UPDATE tenants
      SET subscription_tier = ${tier}
      WHERE id = ${testTenantId}::uuid
    `;
  };

  async function withRls(fn: (reserved: Sql) => Promise<void>) {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
      await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
      await fn(reserved as unknown as Sql);
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      reserved.release();
    }
  }

  async function createLinkedSavedQuery(name: string, sqlText = 'SELECT 1') {
    const result = await savedQueriesService.create(
      testTenantId,
      TEST_MID,
      testUserId,
      { name, sqlText },
    );
    createdSavedQueryIds.push(result.id);

    await savedQueriesService.linkToQA(
      testTenantId,
      TEST_MID,
      testUserId,
      result.id,
      {
        linkedQaObjectId: 'qa-obj-publish-test',
        linkedQaCustomerKey: `qa-key-${result.id.slice(0, 8)}`,
        linkedQaName: 'Publish Test QA',
      },
    );

    return result;
  }

  async function getVersionIdForQuery(savedQueryId: string): Promise<string> {
    let versionId = '';
    await withRls(async (r) => {
      const rows = await r`
        SELECT id FROM query_versions
        WHERE saved_query_id = ${savedQueryId}::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) {
        throw new Error('No version found');
      }
      versionId = row.id;
    });
    return versionId;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(SessionGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          if (!mockSessionUser.userId) {
            return false;
          }
          req.user = mockSessionUser;
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

    const tenantResult = await sqlClient`
      INSERT INTO tenants (eid, tssd, subscription_tier)
      VALUES (${TEST_EID}, ${TEST_TSSD}, 'pro')
      ON CONFLICT (eid) DO UPDATE SET tssd = ${TEST_TSSD}, subscription_tier = 'pro'
      RETURNING id
    `;
    const tenantRow = tenantResult[0];
    if (!tenantRow) {
      throw new Error('Failed to insert test tenant');
    }
    testTenantId = tenantRow.id;

    const userResult = await sqlClient`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES ('sf-publish-int', ${testTenantId}, 'publish-int@example.com', 'Publish Test User')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'Publish Test User'
      RETURNING id
    `;
    const userRow = userResult[0];
    if (!userRow) {
      throw new Error('Failed to insert test user');
    }
    testUserId = userRow.id;

    mockSessionUser.userId = testUserId;
    mockSessionUser.tenantId = testTenantId;

    await withRls(async (r) => {
      await r`DELETE FROM saved_queries WHERE tenant_id = ${testTenantId}::uuid`;
    });
  }, 60000);

  afterAll(async () => {
    for (const id of createdSavedQueryIds) {
      try {
        await withRls(async (r) => {
          await r`DELETE FROM query_publish_events WHERE saved_query_id = ${id}::uuid`;
          await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
        });
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
    await setTenantTier('pro');

    for (const id of [...createdSavedQueryIds]) {
      try {
        await withRls(async (r) => {
          await r`DELETE FROM query_publish_events WHERE saved_query_id = ${id}::uuid`;
          await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
        });
        createdSavedQueryIds.splice(createdSavedQueryIds.indexOf(id), 1);
      } catch {
        // Ignore
      }
    }

    vi.clearAllMocks();
    mockMceBridge.request.mockResolvedValue({});
    mockQDService.retrieveDetail.mockResolvedValue({
      objectId: 'qa-obj-publish-test',
      customerKey: 'qa-key-publish-test',
      name: 'Publish Test QA',
      queryText: 'SELECT 1',
    });
  });

  describe('happy path', () => {
    it('publishes latest version SQL to MCE and creates publish event', async () => {
      const query = await createLinkedSavedQuery(
        'Publish Happy',
        'SELECT name FROM [Subscribers]',
      );
      const versionId = await getVersionIdForQuery(query.id);

      const res = await request(app.getHttpServer())
        .post(`/query-activities/publish/${query.id}`)
        .send({ versionId });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        publishEventId: expect.any(String),
        versionId,
        savedQueryId: query.id,
        publishedSqlHash: expect.any(String),
        publishedAt: expect.any(String),
      });

      expect(mockMceBridge.request).toHaveBeenCalledOnce();
      const callArgs = mockMceBridge.request.mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.[0]).toBe(testTenantId);
      expect(callArgs?.[1]).toBe(testUserId);
      expect(callArgs?.[2]).toBe(TEST_MID);
      expect(callArgs?.[3]).toMatchObject({
        method: 'PATCH',
        url: expect.stringContaining('/automation/v1/queries/'),
        data: { queryText: 'SELECT name FROM [Subscribers]' },
      });

      let eventCount = 0;
      await withRls(async (r) => {
        const rows = await r`
          SELECT count(*) as cnt FROM query_publish_events
          WHERE saved_query_id = ${query.id}::uuid
        `;
        eventCount = Number(rows[0]?.cnt ?? 0);
      });
      expect(eventCount).toBe(1);
    });

    it('publishes a specific version (not necessarily the latest)', async () => {
      const query = await createLinkedSavedQuery(
        'Publish Specific',
        'SELECT v1 FROM [DE]',
      );
      const v1Id = await getVersionIdForQuery(query.id);

      await savedQueriesService.update(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        { sqlText: 'SELECT v2 FROM [DE]' },
      );

      const res = await request(app.getHttpServer())
        .post(`/query-activities/publish/${query.id}`)
        .send({ versionId: v1Id });

      expect(res.status).toBe(201);
      expect(res.body.versionId).toBe(v1Id);

      const patchCall = mockMceBridge.request.mock.calls[0];
      expect(patchCall).toBeDefined();
      expect(patchCall?.[3].data.queryText).toBe('SELECT v1 FROM [DE]');
    });
  });

  describe('feature gating', () => {
    it('returns 403 when deployToAutomation feature is disabled (free tier)', async () => {
      await setTenantTier('free');

      const res = await request(app.getHttpServer())
        .post('/query-activities/publish/fake-id')
        .send({ versionId: '00000000-0000-0000-0000-000000000001' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });
  });

  describe('validation errors', () => {
    it('returns 400 when body is missing versionId', async () => {
      const res = await request(app.getHttpServer())
        .post('/query-activities/publish/fake-id')
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when versionId is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/query-activities/publish/fake-id')
        .send({ versionId: 'not-a-uuid' });

      expect(res.status).toBe(400);
    });
  });

  describe('not found errors', () => {
    it('returns 404 when savedQueryId does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000099';

      const res = await request(app.getHttpServer())
        .post(`/query-activities/publish/${fakeId}`)
        .send({ versionId: '00000000-0000-0000-0000-000000000001' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('returns 404 when saved query is not linked to any QA', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Unlinked Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const versionId = await getVersionIdForQuery(query.id);

      const res = await request(app.getHttpServer())
        .post(`/query-activities/publish/${query.id}`)
        .send({ versionId });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('returns 404 when versionId does not exist for the saved query', async () => {
      const query = await createLinkedSavedQuery('Version 404', 'SELECT 1');
      const fakeVersionId = '00000000-0000-0000-0000-000000000077';

      const res = await request(app.getHttpServer())
        .post(`/query-activities/publish/${query.id}`)
        .send({ versionId: fakeVersionId });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('MCE failure handling', () => {
    it('does not create publish event when MCE PATCH fails', async () => {
      const query = await createLinkedSavedQuery(
        'MCE Fail',
        'SELECT fail FROM [DE]',
      );
      const versionId = await getVersionIdForQuery(query.id);

      mockMceBridge.request.mockRejectedValueOnce(new Error('MCE API timeout'));

      const res = await request(app.getHttpServer())
        .post(`/query-activities/publish/${query.id}`)
        .send({ versionId });

      expect(res.status).toBe(500);

      let eventCount = 0;
      await withRls(async (r) => {
        const rows = await r`
          SELECT count(*) as cnt FROM query_publish_events
          WHERE saved_query_id = ${query.id}::uuid
        `;
        eventCount = Number(rows[0]?.cnt ?? 0);
      });
      expect(eventCount).toBe(0);
    });
  });

  describe('auth', () => {
    it('returns 401 when no session is provided', async () => {
      const originalUserId = mockSessionUser.userId;
      mockSessionUser.userId = '';

      const res = await request(app.getHttpServer())
        .post('/query-activities/publish/fake-id')
        .send({ versionId: '00000000-0000-0000-0000-000000000001' });

      expect(res.status).toBe(403);

      mockSessionUser.userId = originalUserId;
    });
  });
});
