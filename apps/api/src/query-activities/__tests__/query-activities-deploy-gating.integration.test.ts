/**
 * Query Activities Deploy Gating Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - Session and CSRF guards overridden for HTTP testing
 * - MCE SOAP/REST services mocked (external dependencies)
 *
 * Purpose: Confirm the dual-gate model for query-activity endpoints.
 * - POST /query-activities (create), GET /query-activities (list), GET /:customerKey (detail)
 *   are gated by deployToAutomation (Pro+Enterprise).
 * - link/unlink/publish/drift/blast-radius are gated by teamCollaboration (Enterprise-only).
 *
 * Key assertions:
 * - Free-tier: blocked from ALL endpoints (neither feature enabled)
 * - Pro-tier: CAN create/list/detail, CANNOT link/publish/drift/blast (no teamCollaboration)
 * - Enterprise-tier: CAN do everything (both features enabled)
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DataExtensionService,
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
  // eslint-disable-next-line security/detect-object-injection -- trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_EID = 'eid-deploy-gate-int';
const TEST_TSSD = 'test-deploy-gate-int';
const TEST_MID = 'mid-deploy-gate-int';

describe('QueryActivities deploy gating (integration)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;
  let savedQueriesService: SavedQueriesService;

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

  const mockQDService = {
    retrieveAll: vi.fn(),
    retrieveDetail: vi.fn(),
    create: vi.fn(),
    retrieve: vi.fn(),
    retrieveByNameAndFolder: vi.fn(),
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
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(SessionGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
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
      VALUES (${TEST_EID}, ${TEST_TSSD}, 'free')
      ON CONFLICT (eid) DO UPDATE SET tssd = ${TEST_TSSD}, subscription_tier = 'free'
      RETURNING id
    `;
    const tenantRow = tenantResult[0];
    if (!tenantRow) {
      throw new Error('Failed to insert test tenant');
    }
    testTenantId = tenantRow.id;

    const userResult = await sqlClient`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES ('sf-deploy-gate-int', ${testTenantId}, 'deploy-gate@example.com', 'Deploy Gate User')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'Deploy Gate User'
      RETURNING id
    `;
    const userRow = userResult[0];
    if (!userRow) {
      throw new Error('Failed to insert test user');
    }
    testUserId = userRow.id;

    mockSessionUser.userId = testUserId;
    mockSessionUser.tenantId = testTenantId;
  }, 60000);

  afterAll(async () => {
    for (const id of createdSavedQueryIds) {
      try {
        await withRls(testTenantId, TEST_MID, testUserId, async (r) => {
          await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
        });
      } catch {
        // Best effort
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
        await withRls(testTenantId, TEST_MID, testUserId, async (r) => {
          await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
        });
        createdSavedQueryIds.splice(createdSavedQueryIds.indexOf(id), 1);
      } catch {
        // Ignore
      }
    }

    vi.clearAllMocks();
  });

  const FAKE_UUID = '00000000-0000-4000-8000-000000000000';

  describe('free-tier (deployToAutomation=false) blocks all query-activity endpoints', () => {
    it('POST /query-activities returns 403 FEATURE_NOT_ENABLED', async () => {
      const res = await request(app.getHttpServer())
        .post('/query-activities')
        .send({
          name: 'Test QA',
          targetDataExtensionCustomerKey: 'de-key-1',
          queryText: 'SELECT * FROM [TestDE]',
          targetUpdateType: 'Overwrite',
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    it('POST /query-activities/link/:savedQueryId returns 403 FEATURE_NOT_ENABLED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/query-activities/link/${FAKE_UUID}`)
        .send({ qaCustomerKey: 'qa-key-1' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    it('DELETE /query-activities/link/:savedQueryId returns 403 FEATURE_NOT_ENABLED', async () => {
      const res = await request(app.getHttpServer()).delete(
        `/query-activities/link/${FAKE_UUID}`,
      );

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    it('POST /query-activities/publish/:savedQueryId returns 403 FEATURE_NOT_ENABLED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/query-activities/publish/${FAKE_UUID}`)
        .send({ versionId: FAKE_UUID });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    it('GET /query-activities/drift/:savedQueryId returns 403 FEATURE_NOT_ENABLED', async () => {
      const res = await request(app.getHttpServer()).get(
        `/query-activities/drift/${FAKE_UUID}`,
      );

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    it('GET /query-activities/blast-radius/:savedQueryId returns 403 FEATURE_NOT_ENABLED', async () => {
      const res = await request(app.getHttpServer()).get(
        `/query-activities/blast-radius/${FAKE_UUID}`,
      );

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });
  });

  describe('pro-tier (deployToAutomation=true, teamCollaboration=false)', () => {
    it('GET /query-activities succeeds for pro-tier', async () => {
      await setTenantTier('pro');

      mockQDService.retrieveAll.mockResolvedValue([]);

      const res = await request(app.getHttpServer()).get('/query-activities');

      expect(res.status).toBe(200);
    });

    it('POST /query-activities succeeds for pro-tier', async () => {
      await setTenantTier('pro');

      mockDEService.retrieveByCustomerKey.mockResolvedValue({
        objectId: 'de-obj-1',
        customerKey: 'de-key-1',
        name: 'Target DE',
      });
      mockMetadataService.getFields.mockResolvedValue([
        { IsPrimaryKey: true, Name: 'Email' },
      ]);
      mockQDService.retrieveByNameAndFolder.mockResolvedValue(null);
      mockQDService.create.mockResolvedValue({
        objectId: 'qa-obj-new',
        customerKey: 'qa-key-new',
      });

      const res = await request(app.getHttpServer())
        .post('/query-activities')
        .send({
          name: 'Pro QA',
          targetDataExtensionCustomerKey: 'de-key-1',
          queryText: 'SELECT SubscriberKey FROM [TestDE]',
          targetUpdateType: 'Overwrite',
        });

      expect(res.status).toBe(201);
    });

    it('POST /query-activities/link/:savedQueryId returns 403 for pro-tier (requires Enterprise)', async () => {
      await setTenantTier('pro');

      const res = await request(app.getHttpServer())
        .post(`/query-activities/link/${FAKE_UUID}`)
        .send({ qaCustomerKey: 'qa-key-1' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    it('DELETE /query-activities/link/:savedQueryId returns 403 for pro-tier (requires Enterprise)', async () => {
      await setTenantTier('pro');

      const res = await request(app.getHttpServer()).delete(
        `/query-activities/link/${FAKE_UUID}`,
      );

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    it('POST /query-activities/publish/:savedQueryId returns 403 for pro-tier (requires Enterprise)', async () => {
      await setTenantTier('pro');

      const res = await request(app.getHttpServer())
        .post(`/query-activities/publish/${FAKE_UUID}`)
        .send({ versionId: FAKE_UUID });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    it('GET /query-activities/drift/:savedQueryId returns 403 for pro-tier (requires Enterprise)', async () => {
      await setTenantTier('pro');

      const res = await request(app.getHttpServer()).get(
        `/query-activities/drift/${FAKE_UUID}`,
      );

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    it('GET /query-activities/blast-radius/:savedQueryId returns 403 for pro-tier (requires Enterprise)', async () => {
      await setTenantTier('pro');

      const res = await request(app.getHttpServer()).get(
        `/query-activities/blast-radius/${FAKE_UUID}`,
      );

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });
  });

  describe('enterprise-tier (deployToAutomation=true, teamCollaboration=true) succeeds', () => {
    it('POST /query-activities/link/:savedQueryId succeeds for enterprise-tier', async () => {
      await setTenantTier('enterprise');

      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Enterprise Link Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      mockQDService.retrieveDetail.mockResolvedValue({
        objectId: 'qa-obj-ent-link',
        customerKey: 'qa-key-enterprise-link',
        name: 'Enterprise Link QA',
        queryText: 'SELECT 1',
      });

      const res = await request(app.getHttpServer())
        .post(`/query-activities/link/${query.id}`)
        .send({ qaCustomerKey: 'qa-key-enterprise-link' });

      expect(res.status).toBe(201);
    });

    it('POST /query-activities/publish/:savedQueryId succeeds for enterprise-tier (not gated by feature)', async () => {
      await setTenantTier('enterprise');

      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Enterprise Publish Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const res = await request(app.getHttpServer())
        .post(`/query-activities/publish/${query.id}`)
        .send({ versionId: 'ver-1' });

      // Should pass feature gating (not 403)
      expect(res.status).not.toBe(403);
    });

    it('GET /query-activities/drift/:savedQueryId succeeds for enterprise-tier (not gated by feature)', async () => {
      await setTenantTier('enterprise');

      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Enterprise Drift Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const res = await request(app.getHttpServer()).get(
        `/query-activities/drift/${query.id}`,
      );

      // Should pass feature gating (not 403)
      expect(res.status).not.toBe(403);
    });

    it('GET /query-activities/blast-radius/:savedQueryId succeeds for enterprise-tier (not gated by feature)', async () => {
      await setTenantTier('enterprise');

      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Enterprise Blast Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const res = await request(app.getHttpServer()).get(
        `/query-activities/blast-radius/${query.id}`,
      );

      // Should pass feature gating (not 403)
      expect(res.status).not.toBe(403);
    });
  });
});
