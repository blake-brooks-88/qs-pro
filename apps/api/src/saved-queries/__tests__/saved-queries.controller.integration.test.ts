/**
 * SavedQueriesController HTTP Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - HTTP-level testing via supertest
 * - Guard overrides for SessionGuard and CsrfGuard (auth is external boundary)
 * - Behavioral assertions on HTTP responses
 *
 * Key behaviors tested:
 * - HTTP status codes for all endpoints
 * - Response body shapes (ISO dates, link fields, UUIDs)
 * - Validation errors for invalid inputs
 * - CRUD operations via HTTP API
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { SessionGuard } from '@qpp/backend-shared';
import type { Sql } from 'postgres';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { CsrfGuard } from '../../auth/csrf.guard';
import { configureApp } from '../../configure-app';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_EID = 'eid-sq-ctrl-int';
const TEST_TSSD = 'test-sq-ctrl-int';
const TEST_MID = 'mid-sq-ctrl-int';

describe('SavedQueriesController (HTTP integration)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;

  let testTenantId: string;
  let testUserId: string;

  const createdSavedQueryIds: string[] = [];
  const createdFolderIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(SessionGuard)
      .useValue({
        canActivate: (context) => {
          const req = context.switchToHttp().getRequest();
          req.user = {
            userId: testUserId,
            tenantId: testTenantId,
            mid: TEST_MID,
          };
          return true;
        },
      })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await configureApp(app, {
      globalPrefix: true,
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
      VALUES ('sf-sq-ctrl-int', ${testTenantId}, 'sq-ctrl-int@example.com', 'SQ Ctrl Test User')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'SQ Ctrl Test User'
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
    await reserved`DELETE FROM folders WHERE tenant_id = ${testTenantId}::uuid`;
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

    if (testUserId) {
      await sqlClient`DELETE FROM users WHERE id = ${testUserId}::uuid`;
    }
    if (testTenantId) {
      await sqlClient`DELETE FROM tenants WHERE id = ${testTenantId}::uuid`;
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

  describe('POST /api/saved-queries', () => {
    it('should return 201 with correct response shape for valid body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/saved-queries')
        .send({ name: 'Test Query', sqlText: 'SELECT 1' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(res.body.name).toBe('Test Query');
      expect(res.body.sqlText).toBe('SELECT 1');
      expect(res.body.folderId).toBeNull();
      expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(res.body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(res.body.linkedQaObjectId).toBeNull();
      expect(res.body.linkedQaCustomerKey).toBeNull();
      expect(res.body.linkedQaName).toBeNull();
      expect(res.body.linkedAt).toBeNull();

      createdSavedQueryIds.push(res.body.id);
    });

    it('should return 400 for invalid body (missing name)', async () => {
      await request(app.getHttpServer())
        .post('/api/saved-queries')
        .send({ sqlText: 'SELECT 1' })
        .expect(400);
    });

    it('should return 400 for invalid body (empty name)', async () => {
      await request(app.getHttpServer())
        .post('/api/saved-queries')
        .send({ name: '', sqlText: 'SELECT 1' })
        .expect(400);
    });
  });

  describe('GET /api/saved-queries', () => {
    it('should return list with correct format', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/saved-queries')
        .send({
          name: 'List Test Query',
          sqlText: 'SELECT * FROM _Subscribers',
        })
        .expect(201);

      createdSavedQueryIds.push(createRes.body.id);

      const res = await request(app.getHttpServer())
        .get('/api/saved-queries')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      const query = res.body.find((q) => q.id === createRes.body.id);
      expect(query).toBeDefined();
      expect(query.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(query.name).toBe('List Test Query');
      expect(query.folderId).toBeNull();
      expect(query.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(query.linkedQaCustomerKey).toBeNull();
      expect(query.linkedQaName).toBeNull();
      expect(query.linkedAt).toBeNull();
    });
  });

  describe('GET /api/saved-queries/count', () => {
    it('should return count object', async () => {
      const res1 = await request(app.getHttpServer())
        .post('/api/saved-queries')
        .send({ name: 'Count Test 1', sqlText: 'SELECT 1' })
        .expect(201);
      createdSavedQueryIds.push(res1.body.id);

      const res2 = await request(app.getHttpServer())
        .post('/api/saved-queries')
        .send({ name: 'Count Test 2', sqlText: 'SELECT 2' })
        .expect(201);
      createdSavedQueryIds.push(res2.body.id);

      const res = await request(app.getHttpServer())
        .get('/api/saved-queries/count')
        .expect(200);

      expect(res.body).toEqual({ count: 2 });
    });
  });

  describe('GET /api/saved-queries/:id', () => {
    it('should return full query with correct format', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/saved-queries')
        .send({
          name: 'Get By ID Test',
          sqlText: 'SELECT EmailAddress FROM _Subscribers',
        })
        .expect(201);

      createdSavedQueryIds.push(createRes.body.id);

      const res = await request(app.getHttpServer())
        .get(`/api/saved-queries/${createRes.body.id}`)
        .expect(200);

      expect(res.body.id).toBe(createRes.body.id);
      expect(res.body.name).toBe('Get By ID Test');
      expect(res.body.sqlText).toBe('SELECT EmailAddress FROM _Subscribers');
      expect(res.body.folderId).toBeNull();
      expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(res.body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(res.body.linkedQaObjectId).toBeNull();
      expect(res.body.linkedQaCustomerKey).toBeNull();
      expect(res.body.linkedQaName).toBeNull();
      expect(res.body.linkedAt).toBeNull();
    });

    it('should return error for nonexistent ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await request(app.getHttpServer())
        .get(`/api/saved-queries/${fakeId}`)
        .expect(404);

      expect(res.body).toHaveProperty('code', 'RESOURCE_NOT_FOUND');
    });
  });

  describe('PATCH /api/saved-queries/:id', () => {
    it('should return 200 with updated name for valid update', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/saved-queries')
        .send({ name: 'Original Name', sqlText: 'SELECT 1' })
        .expect(201);

      createdSavedQueryIds.push(createRes.body.id);

      const res = await request(app.getHttpServer())
        .patch(`/api/saved-queries/${createRes.body.id}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.id).toBe(createRes.body.id);
      expect(res.body.name).toBe('Updated Name');
      expect(res.body.sqlText).toBe('SELECT 1');
      expect(res.body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should return 400 for invalid body (empty name)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/saved-queries')
        .send({ name: 'Test', sqlText: 'SELECT 1' })
        .expect(201);

      createdSavedQueryIds.push(createRes.body.id);

      await request(app.getHttpServer())
        .patch(`/api/saved-queries/${createRes.body.id}`)
        .send({ name: '' })
        .expect(400);
    });
  });

  describe('DELETE /api/saved-queries/:id', () => {
    it('should delete and return success', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/saved-queries')
        .send({ name: 'Delete Test', sqlText: 'SELECT 1' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/saved-queries/${createRes.body.id}`)
        .expect(200);

      expect(res.body).toEqual({ success: true });

      await request(app.getHttpServer())
        .get(`/api/saved-queries/${createRes.body.id}`)
        .expect(404);
    });
  });
});
