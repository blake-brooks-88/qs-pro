/**
 * Blast Radius Endpoint Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - MCE services mocked (MceBridgeService for REST GET automations)
 * - SessionGuard and CsrfGuard overridden for direct HTTP testing
 *
 * Key behaviors tested:
 * - Returns matching automations when MCE has automations containing the QA
 * - Returns empty list when no automations contain the QA
 * - Correctly identifies high-risk automations (Running, Scheduled, Awaiting Trigger)
 * - Feature gating (free tier -> 403)
 * - Not-linked error (404)
 * - Handles pagination (multiple pages)
 *
 * Mock fidelity:
 * - List endpoint (GET /automation/v1/automations?page=...) returns items WITHOUT steps
 * - Detail endpoint (GET /automation/v1/automations/{id}) returns full automation WITH steps
 * - This matches the real MCE REST API behavior
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

const TEST_EID = 'eid-blast-int';
const TEST_TSSD = 'test-blast-int';
const TEST_MID = 'mid-blast-int';
const TEST_QA_OBJECT_ID = 'qa-obj-blast-test';

const AUTOMATION_STATUS_LABELS: Record<number, string> = {
  0: 'BuildError',
  1: 'Building',
  2: 'Ready',
  3: 'Running',
  4: 'Paused',
  5: 'Stopped',
  6: 'Scheduled',
  7: 'Awaiting Trigger',
  8: 'InactiveTrigger',
};

interface AutomationDef {
  id: string;
  name: string;
  description?: string;
  status: number;
  qaObjectId: string;
}

function buildListResponse(
  automations: AutomationDef[],
  opts?: { totalResults?: number },
) {
  return {
    items: automations.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      statusId: a.status,
      status: AUTOMATION_STATUS_LABELS[a.status] ?? 'Unknown',
    })),
    count: opts?.totalResults ?? automations.length,
  };
}

function buildDetailResponse(a: AutomationDef) {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    statusId: a.status,
    status: AUTOMATION_STATUS_LABELS[a.status] ?? 'Unknown',
    steps: [
      {
        stepNumber: 1,
        activities: [
          {
            id: `act-${a.id}`,
            name: `Activity for ${a.name}`,
            objectTypeId: 300,
            activityObjectId: a.qaObjectId,
          },
        ],
      },
    ],
  };
}

function setupMceMock(
  mock: ReturnType<typeof vi.fn>,
  automations: AutomationDef[],
  opts?: { totalResults?: number },
) {
  const detailMap = new Map(
    automations.map((a) => [a.id, buildDetailResponse(a)]),
  );
  const listResponse = buildListResponse(automations, opts);

  mock.mockImplementation(
    (_t: string, _u: string, _m: string, config: { url: string }) => {
      if (config.url.includes('/automation/v1/automations?')) {
        return Promise.resolve(listResponse);
      }
      const id = config.url.split('/').pop() ?? '';
      const detail = detailMap.get(id);
      if (detail) {
        return Promise.resolve(detail);
      }
      return Promise.resolve({ id, name: '', status: 0, steps: [] });
    },
  );
}

describe('GET /query-activities/blast-radius/:savedQueryId (integration)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;
  let savedQueriesService: SavedQueriesService;

  let testTenantId: string;
  let testUserId: string;

  const createdSavedQueryIds: string[] = [];

  const mockMceBridge = {
    request: vi.fn().mockResolvedValue({ items: [], count: 0 }),
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
        linkedQaObjectId: TEST_QA_OBJECT_ID,
        linkedQaCustomerKey: `qa-key-${result.id.slice(0, 8)}`,
        linkedQaName: 'Blast Radius Test QA',
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
      VALUES ('sf-blast-int', ${testTenantId}, 'blast-int@example.com', 'Blast Radius Test User')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'Blast Radius Test User'
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
      await sqlClient`DELETE FROM tenants WHERE id = ${testTenantId}::uuid`;
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
    mockMceBridge.request.mockResolvedValue({
      items: [],
      count: 0,
    });
  });

  describe('matching automations', () => {
    it('returns automations containing the linked QA', async () => {
      const query = await createLinkedSavedQuery('Blast Query');

      const automations: AutomationDef[] = [
        {
          id: 'auto-1',
          name: 'Daily Extract',
          description: 'Runs daily at 8am',
          status: 3,
          qaObjectId: TEST_QA_OBJECT_ID,
        },
        {
          id: 'auto-2',
          name: 'Weekly Report',
          description: 'Weekly rollup',
          status: 4,
          qaObjectId: TEST_QA_OBJECT_ID,
        },
      ];
      setupMceMock(mockMceBridge.request, automations);

      const res = await request(app.getHttpServer()).get(
        `/query-activities/blast-radius/${query.id}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.automations).toHaveLength(2);
      expect(res.body.totalCount).toBe(2);
      expect(res.body.automations[0]).toMatchObject({
        id: 'auto-1',
        name: 'Daily Extract',
        description: 'Runs daily at 8am',
        status: 'Running',
        isHighRisk: true,
      });
      expect(res.body.automations[1]).toMatchObject({
        id: 'auto-2',
        name: 'Weekly Report',
        status: 'Paused',
        isHighRisk: false,
      });
    });

    it('returns empty list when no automations contain the QA', async () => {
      const query = await createLinkedSavedQuery('No Automations Query');

      const automations: AutomationDef[] = [
        {
          id: 'auto-other',
          name: 'Other Automation',
          status: 2,
          qaObjectId: 'some-other-qa-obj',
        },
      ];
      setupMceMock(mockMceBridge.request, automations);

      const res = await request(app.getHttpServer()).get(
        `/query-activities/blast-radius/${query.id}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.automations).toHaveLength(0);
      expect(res.body.totalCount).toBe(0);
    });
  });

  describe('high-risk detection', () => {
    it('correctly identifies high-risk automations (Running, Scheduled, Awaiting Trigger)', async () => {
      const query = await createLinkedSavedQuery('Risk Detection Query');

      const automations: AutomationDef[] = [
        {
          id: 'auto-running',
          name: 'Running Auto',
          status: 3,
          qaObjectId: TEST_QA_OBJECT_ID,
        },
        {
          id: 'auto-scheduled',
          name: 'Scheduled Auto',
          status: 6,
          qaObjectId: TEST_QA_OBJECT_ID,
        },
        {
          id: 'auto-awaiting',
          name: 'Awaiting Auto',
          status: 7,
          qaObjectId: TEST_QA_OBJECT_ID,
        },
        {
          id: 'auto-ready',
          name: 'Ready Auto',
          status: 2,
          qaObjectId: TEST_QA_OBJECT_ID,
        },
        {
          id: 'auto-paused',
          name: 'Paused Auto',
          status: 4,
          qaObjectId: TEST_QA_OBJECT_ID,
        },
        {
          id: 'auto-stopped',
          name: 'Stopped Auto',
          status: 5,
          qaObjectId: TEST_QA_OBJECT_ID,
        },
      ];
      setupMceMock(mockMceBridge.request, automations);

      const res = await request(app.getHttpServer()).get(
        `/query-activities/blast-radius/${query.id}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.automations).toHaveLength(6);

      const highRisk = res.body.automations.filter(
        (a: { isHighRisk: boolean }) => a.isHighRisk,
      );
      const lowRisk = res.body.automations.filter(
        (a: { isHighRisk: boolean }) => !a.isHighRisk,
      );

      expect(highRisk).toHaveLength(3);
      expect(highRisk.map((a: { name: string }) => a.name).sort()).toEqual([
        'Awaiting Auto',
        'Running Auto',
        'Scheduled Auto',
      ]);

      expect(lowRisk).toHaveLength(3);
      expect(lowRisk.map((a: { name: string }) => a.name).sort()).toEqual([
        'Paused Auto',
        'Ready Auto',
        'Stopped Auto',
      ]);
    });
  });

  describe('feature gating', () => {
    it('returns 403 when deployToAutomation is disabled (free tier)', async () => {
      await setTenantTier('free');

      const res = await request(app.getHttpServer()).get(
        '/query-activities/blast-radius/00000000-0000-4000-8000-000000000000',
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
        { name: 'Unlinked Blast Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(query.id);

      const res = await request(app.getHttpServer()).get(
        `/query-activities/blast-radius/${query.id}`,
      );

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('pagination', () => {
    it('handles multiple pages of automations', async () => {
      const query = await createLinkedSavedQuery('Paginated Query');

      const page1Auto: AutomationDef = {
        id: 'auto-p1',
        name: 'Page 1 Auto',
        status: 3,
        qaObjectId: TEST_QA_OBJECT_ID,
      };
      const page2Auto: AutomationDef = {
        id: 'auto-p2',
        name: 'Page 2 Auto',
        status: 2,
        qaObjectId: TEST_QA_OBJECT_ID,
      };

      const detailMap = new Map([
        ['auto-p1', buildDetailResponse(page1Auto)],
        ['auto-p2', buildDetailResponse(page2Auto)],
      ]);

      let listCallCount = 0;
      mockMceBridge.request.mockImplementation(
        (_t: string, _u: string, _m: string, config: { url: string }) => {
          if (config.url.includes('/automation/v1/automations?')) {
            listCallCount++;
            if (listCallCount === 1) {
              return Promise.resolve(
                buildListResponse([page1Auto], { totalResults: 250 }),
              );
            }
            return Promise.resolve(
              buildListResponse([page2Auto], { totalResults: 250 }),
            );
          }
          const id = config.url.split('/').pop() ?? '';
          return Promise.resolve(
            detailMap.get(id) ?? { id, name: '', status: 0, steps: [] },
          );
        },
      );

      const res = await request(app.getHttpServer()).get(
        `/query-activities/blast-radius/${query.id}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.automations).toHaveLength(2);

      const names = res.body.automations.map((a: { name: string }) => a.name);
      expect(names).toContain('Page 1 Auto');
      expect(names).toContain('Page 2 Auto');
    });
  });
});
