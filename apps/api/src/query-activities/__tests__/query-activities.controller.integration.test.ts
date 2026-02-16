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
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_EID = 'eid-qa-ctrl-int';
const TEST_TSSD = 'test-qa-ctrl-int';
const TEST_MID = 'mid-qa-ctrl-int';

describe('QueryActivitiesController (integration)', () => {
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
      VALUES ('sf-qa-ctrl-int', ${testTenantId}, 'qa-ctrl-int@example.com', 'QA Ctrl Test User')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'QA Ctrl Test User'
      RETURNING id
    `;
    const userRow = userResult[0];
    if (!userRow) {
      throw new Error('Failed to insert test user');
    }
    testUserId = userRow.id;

    mockSessionUser.userId = testUserId;
    mockSessionUser.tenantId = testTenantId;

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

    vi.clearAllMocks();
  });

  describe('feature gating', () => {
    it('POST / returns 403 when deploy feature is disabled (free tier)', async () => {
      await setTenantTier('free');

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

    it('GET / returns 403 when deploy feature is disabled (free tier)', async () => {
      await setTenantTier('free');

      const res = await request(app.getHttpServer()).get('/query-activities');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    it('POST /link/:savedQueryId returns 403 when deploy feature is disabled (free tier)', async () => {
      await setTenantTier('free');

      const res = await request(app.getHttpServer())
        .post('/query-activities/link/00000000-0000-4000-8000-000000000000')
        .send({ qaCustomerKey: 'qa-key-1' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    it('DELETE /link/:savedQueryId returns 403 when deploy feature is disabled (free tier)', async () => {
      await setTenantTier('free');

      const res = await request(app.getHttpServer()).delete(
        '/query-activities/link/00000000-0000-4000-8000-000000000000',
      );

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    it('GET /:customerKey returns 403 when deploy feature is disabled (free tier)', async () => {
      await setTenantTier('free');

      const res = await request(app.getHttpServer()).get(
        '/query-activities/qa-key-1',
      );

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    it('endpoints work when deploy feature is enabled (pro tier)', async () => {
      await setTenantTier('pro');

      mockQDService.retrieveAll.mockResolvedValue([]);

      const res = await request(app.getHttpServer()).get('/query-activities');

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/query-activities', () => {
    it('creates query activity and returns objectId and customerKey', async () => {
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
      mockQDService.retrieve.mockResolvedValue(null);
      mockQDService.create.mockResolvedValue({ objectId: 'qa-obj-1' });

      const res = await request(app.getHttpServer())
        .post('/query-activities')
        .send({
          name: 'Test QA',
          targetDataExtensionCustomerKey: 'de-key-1',
          queryText: 'SELECT * FROM [TestDE]',
          targetUpdateType: 'Overwrite',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        objectId: 'qa-obj-1',
        customerKey: expect.any(String),
      });

      expect(mockDEService.retrieveByCustomerKey).toHaveBeenCalledWith(
        testTenantId,
        testUserId,
        TEST_MID,
        'de-key-1',
        undefined,
      );
      expect(mockQDService.create).toHaveBeenCalled();
    });

    it('returns 400 when body is invalid', async () => {
      await setTenantTier('pro');

      const res = await request(app.getHttpServer())
        .post('/query-activities')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/query-activities', () => {
    it('returns list with link status', async () => {
      await setTenantTier('pro');

      mockQDService.retrieveAll.mockResolvedValue([
        {
          objectId: 'qa-obj-1',
          customerKey: 'qa-key-1',
          name: 'QA One',
          categoryId: 100,
          targetUpdateType: 'Overwrite',
          modifiedDate: '2026-02-01T00:00:00Z',
          status: 'Active',
        },
        {
          objectId: 'qa-obj-2',
          customerKey: 'qa-key-2',
          name: 'QA Two',
          categoryId: 100,
          targetUpdateType: 'Append',
          modifiedDate: '2026-02-02T00:00:00Z',
          status: 'Active',
        },
      ]);

      const savedQuery = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Linked Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(savedQuery.id);

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        savedQuery.id,
        {
          linkedQaObjectId: 'qa-obj-1',
          linkedQaCustomerKey: 'qa-key-1',
          linkedQaName: 'QA One',
        },
      );

      const res = await request(app.getHttpServer()).get('/query-activities');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);

      const linkedItem = res.body.find(
        (item: any) => item.customerKey === 'qa-key-1',
      );
      const unlinkedItem = res.body.find(
        (item: any) => item.customerKey === 'qa-key-2',
      );

      expect(linkedItem).toMatchObject({
        objectId: 'qa-obj-1',
        customerKey: 'qa-key-1',
        name: 'QA One',
        isLinked: true,
        linkedToQueryName: 'Linked Query',
      });

      expect(unlinkedItem).toMatchObject({
        objectId: 'qa-obj-2',
        customerKey: 'qa-key-2',
        name: 'QA Two',
        isLinked: false,
        linkedToQueryName: null,
      });
    });
  });

  describe('POST /api/query-activities/link/:savedQueryId', () => {
    it('links saved query to query activity', async () => {
      await setTenantTier('pro');

      const savedQuery = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'My Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(savedQuery.id);

      mockQDService.retrieveDetail.mockResolvedValue({
        objectId: 'qa-obj-1',
        customerKey: 'qa-key-1',
        name: 'QA One',
        categoryId: 100,
        queryText: 'SELECT * FROM [TestDE]',
        targetUpdateType: 'Overwrite',
        targetDEName: 'Target DE',
        targetDECustomerKey: 'de-key-1',
        modifiedDate: '2026-02-01T00:00:00Z',
        status: 'Active',
      });

      const res = await request(app.getHttpServer())
        .post(`/query-activities/link/${savedQuery.id}`)
        .send({ qaCustomerKey: 'qa-key-1' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        linkedQaObjectId: 'qa-obj-1',
        linkedQaCustomerKey: 'qa-key-1',
        linkedQaName: 'QA One',
        linkedAt: expect.any(String),
        sqlUpdated: false,
      });

      expect(mockQDService.retrieveDetail).toHaveBeenCalledWith(
        testTenantId,
        testUserId,
        TEST_MID,
        'qa-key-1',
      );
    });

    it('returns 400 when body is missing qaCustomerKey', async () => {
      await setTenantTier('pro');

      const res = await request(app.getHttpServer())
        .post('/query-activities/link/00000000-0000-4000-8000-000000000000')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/query-activities/link/:savedQueryId', () => {
    it('unlinks saved query from query activity', async () => {
      await setTenantTier('pro');

      const savedQuery = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Linked Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(savedQuery.id);

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        savedQuery.id,
        {
          linkedQaObjectId: 'qa-obj-1',
          linkedQaCustomerKey: 'qa-key-1',
          linkedQaName: 'QA One',
        },
      );

      const res = await request(app.getHttpServer()).delete(
        `/query-activities/link/${savedQuery.id}`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });
  });

  describe('GET /api/query-activities/:customerKey', () => {
    it('returns query activity detail with link status', async () => {
      await setTenantTier('pro');

      mockQDService.retrieveDetail.mockResolvedValue({
        objectId: 'qa-obj-1',
        customerKey: 'qa-key-1',
        name: 'QA One',
        categoryId: 100,
        queryText: 'SELECT * FROM [TestDE]',
        targetUpdateType: 'Overwrite',
        targetDEName: 'Target DE',
        targetDECustomerKey: 'de-key-1',
        modifiedDate: '2026-02-01T00:00:00Z',
        status: 'Active',
      });

      const savedQuery = await savedQueriesService.create(
        testTenantId,
        TEST_MID,
        testUserId,
        { name: 'Linked Query', sqlText: 'SELECT 1' },
      );
      createdSavedQueryIds.push(savedQuery.id);

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        savedQuery.id,
        {
          linkedQaObjectId: 'qa-obj-1',
          linkedQaCustomerKey: 'qa-key-1',
          linkedQaName: 'QA One',
        },
      );

      const res = await request(app.getHttpServer()).get(
        '/query-activities/qa-key-1',
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        objectId: 'qa-obj-1',
        customerKey: 'qa-key-1',
        name: 'QA One',
        queryText: 'SELECT * FROM [TestDE]',
        isLinked: true,
        linkedToQueryName: 'Linked Query',
      });

      expect(mockQDService.retrieveDetail).toHaveBeenCalledWith(
        testTenantId,
        testUserId,
        TEST_MID,
        'qa-key-1',
      );
    });
  });
});
