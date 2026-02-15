/**
 * Drift Check Endpoint Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - MCE services mocked (QueryDefinitionService for SOAP retrieveDetail)
 * - SessionGuard and CsrfGuard overridden for direct HTTP testing
 *
 * Key behaviors tested:
 * - No drift when local and remote SQL match (same hash)
 * - Drift detected when local and remote SQL differ
 * - Feature gating (free tier -> 403)
 * - Not-linked error (404)
 * - No-versions error (drift with empty local SQL)
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

const TEST_EID = 'eid-drift-int';
const TEST_TSSD = 'test-drift-int';
const TEST_MID = 'mid-drift-int';

describe('GET /query-activities/drift/:savedQueryId (integration)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;
  let savedQueriesService: SavedQueriesService;

  let testTenantId: string;
  let testUserId: string;

  const createdSavedQueryIds: string[] = [];

  const mockQDService = {
    retrieveAll: vi.fn().mockResolvedValue([]),
    retrieveDetail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ objectId: 'qa-obj-1' }),
    retrieve: vi.fn().mockResolvedValue(null),
    retrieveByNameAndFolder: vi.fn().mockResolvedValue(null),
  };

  const mockMceBridge = {
    request: vi.fn().mockResolvedValue({}),
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
        linkedQaObjectId: 'qa-obj-drift-test',
        linkedQaCustomerKey: `qa-key-${result.id.slice(0, 8)}`,
        linkedQaName: 'Drift Test QA',
      },
    );

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
      VALUES ('sf-drift-int', ${testTenantId}, 'drift-int@example.com', 'Drift Test User')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'Drift Test User'
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
          await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
        });
        createdSavedQueryIds.splice(createdSavedQueryIds.indexOf(id), 1);
      } catch {
        // Ignore
      }
    }

    vi.clearAllMocks();
  });

  describe('no drift', () => {
    it('returns hasDrift: false when local SQL matches remote QA SQL', async () => {
      const localSql = 'SELECT email FROM [Subscribers]';
      const query = await createLinkedSavedQuery('No Drift Query', localSql);

      mockQDService.retrieveDetail.mockResolvedValue({
        objectId: 'qa-obj-drift-test',
        customerKey: `qa-key-${query.id.slice(0, 8)}`,
        name: 'Drift Test QA',
        queryText: localSql,
      });

      const res = await request(app.getHttpServer()).get(
        `/query-activities/drift/${query.id}`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        hasDrift: false,
        localSql,
        remoteSql: localSql,
      });
      expect(res.body.localHash).toBe(res.body.remoteHash);
    });
  });

  describe('drift detected', () => {
    it('returns hasDrift: true with both SQL texts when local differs from remote', async () => {
      const localSql = 'SELECT local_field FROM [DE]';
      const remoteSql = 'SELECT remote_field FROM [DE]';
      const query = await createLinkedSavedQuery('Drifted Query', localSql);

      mockQDService.retrieveDetail.mockResolvedValue({
        objectId: 'qa-obj-drift-test',
        customerKey: `qa-key-${query.id.slice(0, 8)}`,
        name: 'Drift Test QA',
        queryText: remoteSql,
      });

      const res = await request(app.getHttpServer()).get(
        `/query-activities/drift/${query.id}`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        hasDrift: true,
        localSql,
        remoteSql,
      });
      expect(res.body.localHash).not.toBe(res.body.remoteHash);
    });
  });

  describe('feature gating', () => {
    it('returns 403 when deployToAutomation is disabled (free tier)', async () => {
      await setTenantTier('free');

      const res = await request(app.getHttpServer()).get(
        '/query-activities/drift/fake-id',
      );

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });
  });

  describe('error cases', () => {
    it('returns 404 when saved query is not linked', async () => {
      const query = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Unlinked Drift Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const res = await request(app.getHttpServer()).get(
        `/query-activities/drift/${query.id}`,
      );

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('returns drift with empty local SQL when saved query has no versions', async () => {
      const query = await createLinkedSavedQuery('Has Version', 'SELECT 1');

      await withRls(async (r) => {
        await r`DELETE FROM query_versions WHERE saved_query_id = ${query.id}::uuid`;
      });

      mockQDService.retrieveDetail.mockResolvedValue({
        objectId: 'qa-obj-drift-test',
        customerKey: `qa-key-${query.id.slice(0, 8)}`,
        name: 'Drift Test QA',
        queryText: 'SELECT remote FROM [DE]',
      });

      const res = await request(app.getHttpServer()).get(
        `/query-activities/drift/${query.id}`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        hasDrift: true,
        localSql: '',
        remoteSql: 'SELECT remote FROM [DE]',
      });
    });
  });
});
