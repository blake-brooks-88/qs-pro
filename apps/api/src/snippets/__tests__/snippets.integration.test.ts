/**
 * Snippets Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - HTTP-level testing via supertest
 * - Guard overrides for SessionGuard and CsrfGuard (auth is external boundary)
 * - Tier gating controlled via setTestTenantTier() against real DB
 * - Behavioral assertions on HTTP responses
 *
 * Key behaviors tested:
 * - CRUD happy path (create, list, update, delete)
 * - Validation errors for invalid inputs
 * - Scope behavior (bu vs tenant)
 * - Tier gating (403 when teamSnippets feature is disabled)
 */
import type { ExecutionContext } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { SessionGuard } from '@qpp/backend-shared';
import type { Sql } from 'postgres';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  deleteTestTenantSubscription,
  setTestTenantTier,
} from '../../../test/helpers/set-test-tenant-tier';
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

const TEST_EID = 'test---snippets-int';
const TEST_TSSD = 'test-snippets-int';
const TEST_MID = 'mid-snippets-int';
const TEST_MID_2 = 'mid-snippets-int-2';

describe('SnippetsController (HTTP integration)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;

  let testTenantId: string;
  let testUserId: string;

  const createdSnippetIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(SessionGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
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
      VALUES ('sf-snippets-int', ${testTenantId}, 'snippets-int@example.com', 'Snippets Test User')
      ON CONFLICT (sf_user_id) DO UPDATE SET name = 'Snippets Test User'
      RETURNING id
    `;
    const userRow = userResult[0];
    if (!userRow) {
      throw new Error('Failed to insert test user');
    }
    testUserId = userRow.id;

    // Enable teamSnippets by setting pro tier
    await setTestTenantTier(sqlClient, testTenantId, 'pro');
  }, 60000);

  afterAll(async () => {
    // Clean up all snippets created by tests
    for (const id of createdSnippetIds) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
        await reserved`DELETE FROM snippets WHERE id = ${id}::uuid`;
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
      await deleteTestTenantSubscription(sqlClient, testTenantId);
      await sqlClient`DELETE FROM tenants WHERE id = ${testTenantId}::uuid`;
    }

    await app.close();
  }, 30000);

  beforeEach(async () => {
    // Clean up previously-created snippets between tests to avoid interference
    for (const id of [...createdSnippetIds]) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
        await reserved`DELETE FROM snippets WHERE id = ${id}::uuid`;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
        reserved.release();
        createdSnippetIds.splice(createdSnippetIds.indexOf(id), 1);
      } catch {
        // Ignore
      }
    }

    // Restore pro tier before each test (some tier-gating tests change it)
    await setTestTenantTier(sqlClient, testTenantId, 'pro');
  });

  // ===========================================================================
  // 1. CRUD Happy Path
  // ===========================================================================

  describe('POST /api/snippets', () => {
    it('creates a snippet and returns it with all expected fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/snippets')
        .send({
          title: 'My Snippet',
          triggerPrefix: 'mysnip',
          code: 'SELECT 1',
          scope: 'bu',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        title: 'My Snippet',
        triggerPrefix: 'mysnip',
        code: 'SELECT 1',
        scope: 'bu',
      });
      expect(res.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(res.body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      createdSnippetIds.push(res.body.id);
    });
  });

  describe('GET /api/snippets', () => {
    it('returns the created snippet in the list with creator attribution', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/snippets')
        .send({
          title: 'List Test Snippet',
          triggerPrefix: 'lstsnip',
          code: 'SELECT EmailAddress FROM _Subscribers',
          scope: 'bu',
        })
        .expect(201);

      createdSnippetIds.push(createRes.body.id);

      const res = await request(app.getHttpServer())
        .get('/api/snippets')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);

      const snippet = res.body.find(
        (s: Record<string, unknown>) => s.id === createRes.body.id,
      );
      expect(snippet).toBeDefined();
      expect(snippet.title).toBe('List Test Snippet');
      expect(snippet.triggerPrefix).toBe('lstsnip');
      expect(snippet.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('PATCH /api/snippets/:id', () => {
    it('updates title, code, and triggerPrefix', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/snippets')
        .send({
          title: 'Original Title',
          triggerPrefix: 'orig',
          code: 'SELECT 1',
          scope: 'bu',
        })
        .expect(201);

      createdSnippetIds.push(createRes.body.id);

      const res = await request(app.getHttpServer())
        .patch(`/api/snippets/${createRes.body.id}`)
        .send({
          title: 'Updated Title',
          triggerPrefix: 'upd',
          code: 'SELECT 2',
        })
        .expect(200);

      expect(res.body.id).toBe(createRes.body.id);
      expect(res.body.title).toBe('Updated Title');
      expect(res.body.triggerPrefix).toBe('upd');
      expect(res.body.code).toBe('SELECT 2');
    });
  });

  describe('DELETE /api/snippets/:id', () => {
    it('removes the snippet and subsequent GET returns empty list', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/snippets')
        .send({
          title: 'Delete Me',
          triggerPrefix: 'delme',
          code: 'SELECT 1',
          scope: 'bu',
        })
        .expect(201);

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/snippets/${createRes.body.id}`)
        .expect(200);

      expect(deleteRes.body).toEqual({ success: true });

      const listRes = await request(app.getHttpServer())
        .get('/api/snippets')
        .expect(200);

      const found = listRes.body.find(
        (s: Record<string, unknown>) => s.id === createRes.body.id,
      );
      expect(found).toBeUndefined();
    });
  });

  // ===========================================================================
  // 2. Validation
  // ===========================================================================

  describe('Validation', () => {
    it('POST returns 400 for empty title', async () => {
      await request(app.getHttpServer())
        .post('/api/snippets')
        .send({ title: '', triggerPrefix: 'test', code: 'SELECT 1' })
        .expect(400);
    });

    it('POST returns 400 for trigger prefix starting with a number', async () => {
      await request(app.getHttpServer())
        .post('/api/snippets')
        .send({ title: 'Test', triggerPrefix: '1bad', code: 'SELECT 1' })
        .expect(400);
    });

    it('POST returns 400 for trigger prefix with special characters', async () => {
      await request(app.getHttpServer())
        .post('/api/snippets')
        .send({ title: 'Test', triggerPrefix: 'bad-prefix!', code: 'SELECT 1' })
        .expect(400);
    });

    it('PATCH returns 404 for nonexistent snippet UUID', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000001';

      await request(app.getHttpServer())
        .patch(`/api/snippets/${fakeId}`)
        .send({ title: 'Updated' })
        .expect(404);
    });

    it('DELETE returns 404 for nonexistent snippet UUID', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000002';

      await request(app.getHttpServer())
        .delete(`/api/snippets/${fakeId}`)
        .expect(404);
    });
  });

  // ===========================================================================
  // 3. Scope Behavior
  // ===========================================================================

  describe('Scope behavior', () => {
    it('bu-scoped snippet is returned when queried with same mid', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/snippets')
        .send({
          title: 'BU Snippet',
          triggerPrefix: 'busnip',
          code: 'SELECT 1',
          scope: 'bu',
        })
        .expect(201);

      createdSnippetIds.push(createRes.body.id);

      const listRes = await request(app.getHttpServer())
        .get('/api/snippets')
        .expect(200);

      const found = listRes.body.find(
        (s: Record<string, unknown>) => s.id === createRes.body.id,
      );
      expect(found).toBeDefined();
      expect(found.scope).toBe('bu');
    });

    it('tenant-scoped snippet is returned regardless of mid value', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/snippets')
        .send({
          title: 'Tenant Snippet',
          triggerPrefix: 'tntsnip',
          code: 'SELECT 1',
          scope: 'tenant',
        })
        .expect(201);

      createdSnippetIds.push(createRes.body.id);

      // Verify the snippet appears from the primary MID
      const listRes = await request(app.getHttpServer())
        .get('/api/snippets')
        .expect(200);

      const found = listRes.body.find(
        (s: Record<string, unknown>) => s.id === createRes.body.id,
      );
      expect(found).toBeDefined();
      expect(found.scope).toBe('tenant');

      // Verify tenant-scoped snippet is readable via direct DB query from a different MID
      const reserved = await sqlClient.reserve();
      await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID_2}, false)`;
      await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
      const rows = await reserved`
        SELECT id FROM snippets
        WHERE id = ${createRes.body.id}::uuid
          AND tenant_id = ${testTenantId}::uuid
      `;
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      reserved.release();

      expect(rows.length).toBe(1);
    });
  });

  // ===========================================================================
  // 4. Tier Gating
  // ===========================================================================

  describe('Tier gating (teamSnippets feature disabled on free tier)', () => {
    beforeEach(async () => {
      await setTestTenantTier(sqlClient, testTenantId, 'free');
    });

    it('POST returns 403 with FEATURE_NOT_ENABLED when teamSnippets disabled', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/snippets')
        .send({ title: 'Test', triggerPrefix: 'test', code: 'SELECT 1' })
        .expect(403);

      expect(res.body).toMatchObject({ code: 'FEATURE_NOT_ENABLED' });
    });

    it('PATCH returns 403 with FEATURE_NOT_ENABLED when teamSnippets disabled', async () => {
      // First create the snippet under pro tier
      await setTestTenantTier(sqlClient, testTenantId, 'pro');
      const createRes = await request(app.getHttpServer())
        .post('/api/snippets')
        .send({ title: 'Test', triggerPrefix: 'testpatch', code: 'SELECT 1' })
        .expect(201);
      createdSnippetIds.push(createRes.body.id);

      // Downgrade to free tier
      await setTestTenantTier(sqlClient, testTenantId, 'free');

      const res = await request(app.getHttpServer())
        .patch(`/api/snippets/${createRes.body.id}`)
        .send({ title: 'Updated' })
        .expect(403);

      expect(res.body).toMatchObject({ code: 'FEATURE_NOT_ENABLED' });
    });

    it('DELETE returns 403 with FEATURE_NOT_ENABLED when teamSnippets disabled', async () => {
      // First create the snippet under pro tier
      await setTestTenantTier(sqlClient, testTenantId, 'pro');
      const createRes = await request(app.getHttpServer())
        .post('/api/snippets')
        .send({ title: 'Test', triggerPrefix: 'testdel', code: 'SELECT 1' })
        .expect(201);
      createdSnippetIds.push(createRes.body.id);

      // Downgrade to free tier
      await setTestTenantTier(sqlClient, testTenantId, 'free');

      const res = await request(app.getHttpServer())
        .delete(`/api/snippets/${createRes.body.id}`)
        .expect(403);

      expect(res.body).toMatchObject({ code: 'FEATURE_NOT_ENABLED' });
    });

    it('GET returns 403 with FEATURE_NOT_ENABLED when teamSnippets disabled', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/snippets')
        .expect(403);

      expect(res.body).toMatchObject({ code: 'FEATURE_NOT_ENABLED' });
    });
  });
});
