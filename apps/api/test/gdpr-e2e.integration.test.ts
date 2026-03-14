import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { externalOnlyOnUnhandledRequest } from '@qpp/test-utils';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Sql } from 'postgres';
import { Agent, agent as superagent } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import {
  cleanupGdprTestData,
  createTestAuditLog,
  createTestCredential,
  createTestFolder,
  createTestOrgSubscription,
  createTestSnippet,
  createTestTenant,
  createTestUser,
} from './helpers/gdpr-test-data';

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_TSSD = 'test---gdpr-tssd';
const MID = 'mid-gdpr-e2e';

const mswServer = setupServer(
  http.post(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`, () =>
    HttpResponse.json({
      access_token: 'e2e-access-token',
      refresh_token: 'e2e-refresh-token',
      expires_in: 3600,
      rest_instance_url: 'https://test-rest.com',
      soap_instance_url: 'https://test-soap.com',
      scope: 'read write',
      token_type: 'Bearer',
    }),
  ),
  http.get(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`, () =>
    HttpResponse.json({
      sub: 'gdpr-owner-sf',
      enterprise_id: 'test---gdpr-e2e-http',
      member_id: MID,
      email: 'owner@gdpr-test.com',
      name: 'GDPR Test Owner',
    }),
  ),
);

/**
 * GDPR Endpoints – Full HTTP E2E Tests
 *
 * Boots the real NestJS app, creates a disposable test tenant,
 * authenticates via JWT login, and exercises every GDPR endpoint
 * through the HTTP layer (SessionGuard, RolesGuard, audit decorator, etc.).
 */
describe('GDPR Endpoints (HTTP E2E)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;
  let ownerAgent: Agent;

  let tenantId: string;
  let ownerId: string;
  let memberId: string;

  async function loginAs(
    sfUserId: string,
    eid: string,
    mid: string,
  ): Promise<Agent> {
    const ag = superagent(app.getHttpServer());

    // Override MSW userinfo to return this user's identity
    mswServer.use(
      http.get(
        `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
        () =>
          HttpResponse.json({
            sub: sfUserId,
            enterprise_id: eid,
            member_id: mid,
            email: `${sfUserId}@gdpr-test.com`,
            name: `GDPR User ${sfUserId}`,
          }),
      ),
    );

    // OAuth flow: login -> redirect -> callback
    const loginResp = await ag
      .get('/auth/login')
      .query({ tssd: TEST_TSSD })
      .expect(302);

    const redirectUrl = loginResp.headers.location;
    const state = new URL(redirectUrl).searchParams.get('state');
    if (!state) {
      throw new Error('Missing state in OAuth redirect');
    }

    await ag
      .get('/auth/callback')
      .query({
        code: 'test-code',
        state,
        sf_user_id: sfUserId,
        eid,
        mid,
      })
      .expect(302);

    // Verify session established
    const meResp = await ag.get('/auth/me').expect(200);
    expect(meResp.body.user.sfUserId).toBe(sfUserId);

    return ag;
  }

  beforeAll(async () => {
    mswServer.listen({
      onUnhandledRequest: externalOnlyOnUnhandledRequest(),
    });

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

    // Seed test data
    const t = await createTestTenant(sqlClient, 'e2e-http');
    tenantId = t.tenantId;

    const owner = await createTestUser(sqlClient, tenantId, {
      sfUserId: 'gdpr-owner-sf',
      role: 'owner',
      email: 'owner@gdpr-test.com',
      name: 'GDPR Test Owner',
    });
    ownerId = owner.userId;

    const member = await createTestUser(sqlClient, tenantId, {
      sfUserId: 'gdpr-member-sf',
      role: 'member',
      email: 'member@gdpr-test.com',
      name: 'GDPR Test Member',
    });
    memberId = member.userId;

    await createTestCredential(sqlClient, tenantId, MID, ownerId);
    await createTestCredential(sqlClient, tenantId, MID, memberId);
    await createTestOrgSubscription(sqlClient, tenantId, { tier: 'free' });

    // Create content for the member (to test export and deletion archive)
    await createTestFolder(sqlClient, tenantId, MID, memberId, {
      name: 'Member Personal Folder',
      visibility: 'personal',
    });
    await createTestSnippet(sqlClient, tenantId, memberId, {
      title: 'Member Snippet',
      code: 'SELECT 1',
    });
    await createTestAuditLog(sqlClient, tenantId, MID, memberId);

    // Login as owner via full HTTP OAuth flow
    ownerAgent = await loginAs('gdpr-owner-sf', t.eid, MID);
  }, 60_000);

  afterAll(async () => {
    await cleanupGdprTestData(tenantId, [ownerId, memberId]);
    mswServer.close();
    await app.close();
  }, 30_000);

  // ────────────────────────────────────────────────────────────────────
  // Test 1: Tenant Soft-Delete (owner-only)
  // ────────────────────────────────────────────────────────────────────

  describe('DELETE /admin/tenant (soft-delete)', () => {
    // We test RBAC rejection first, then the actual deletion last
    // (since soft-delete will block all further requests for this tenant)

    it('should reject non-owner (member) with 403', async () => {
      const memberAgent = await loginAs(
        'gdpr-member-sf',
        `test---gdpr-e2e-http`,
        MID,
      );

      const resp = await memberAgent.delete('/admin/tenant').expect(403);

      expect(resp.body).toBeDefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 2: User Deletion (owner/admin RBAC)
  // ────────────────────────────────────────────────────────────────────

  describe('DELETE /admin/members/:id (user deletion)', () => {
    it('should prevent self-deletion with 400', async () => {
      const resp = await ownerAgent
        .delete(`/admin/members/${ownerId}`)
        .expect(400);

      expect(resp.body).toBeDefined();
    });

    it('should reject invalid UUID param with 400', async () => {
      await ownerAgent.delete('/admin/members/not-a-uuid').expect(400);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 3: GDPR Data Export
  // ────────────────────────────────────────────────────────────────────

  describe('GET /admin/members/:id/export (data export)', () => {
    it('should export member data as owner', async () => {
      const resp = await ownerAgent
        .get(`/admin/members/${memberId}/export`)
        .expect(200);

      expect(resp.body.user).toBeDefined();
      expect(resp.body.user.id).toBe(memberId);
      expect(resp.body.user.email).toBeDefined();
      expect(resp.body.savedQueries).toBeInstanceOf(Array);
      expect(resp.body.folders).toBeInstanceOf(Array);
      expect(resp.body.snippets).toBeInstanceOf(Array);
      expect(resp.body.exportedAt).toBeDefined();
    });

    it('should reject unauthenticated request', async () => {
      const anonAgent = superagent(app.getHttpServer());
      await anonAgent.get(`/admin/members/${memberId}/export`).expect(401);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 4: Delete member, then soft-delete tenant + verify lockout
  // ────────────────────────────────────────────────────────────────────

  describe('Full GDPR lifecycle: delete user → soft-delete tenant → lockout', () => {
    it('should delete member via HTTP', async () => {
      const resp = await ownerAgent
        .delete(`/admin/members/${memberId}`)
        .expect(200);

      expect(resp.body.ok).toBe(true);
    });

    it('should soft-delete tenant and return gracePeriodDays', async () => {
      const resp = await ownerAgent.delete('/admin/tenant').expect(200);

      expect(resp.body.ok).toBe(true);
      expect(resp.body.gracePeriodDays).toBe(30);
    });

    it('should block subsequent API calls after soft-delete (403)', async () => {
      // After soft-delete, SessionGuard blocks all requests for this tenant.
      // We authenticate via OAuth (login + callback) but then /auth/me should
      // return 403 because the tenant is soft-deleted.
      const ag = superagent(app.getHttpServer());

      mswServer.use(
        http.get(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
          () =>
            HttpResponse.json({
              sub: 'gdpr-owner-sf',
              enterprise_id: `test---gdpr-e2e-http`,
              member_id: MID,
              email: 'owner@gdpr-test.com',
              name: 'GDPR Test Owner',
            }),
        ),
      );

      const loginResp = await ag
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResp.headers.location;
      const state = new URL(redirectUrl).searchParams.get('state');
      if (!state) {
        throw new Error('Missing state');
      }

      await ag
        .get('/auth/callback')
        .query({
          code: 'test-code',
          state,
          sf_user_id: 'gdpr-owner-sf',
          eid: `test---gdpr-e2e-http`,
          mid: MID,
        })
        .expect(302);

      // This is the key assertion: SessionGuard sees deleted_at and returns 403
      await ag.get('/auth/me').expect(403);
    });
  });
});
