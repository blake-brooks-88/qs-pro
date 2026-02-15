/**
 * Auth Endpoints Integration Tests
 *
 * Goals:
 * - Assert observable behavior via real HTTP requests
 * - Real NestJS app with FastifyAdapter
 * - Real PostgreSQL database (RLS-enabled)
 * - MSW for MCE API mocking (external boundary only)
 *
 * Covered Scenarios:
 * - POST /auth/login:
 *   - JSON response when Accept: application/json
 *   - JWT accepted in body.jwt, body.token, body.access_token, body.accessToken, body.JWT
 * - GET /auth/login:
 *   - Existing valid session redirects to /
 *   - JWT in query string creates session
 *   - No TSSD and not MCE embed throws 401
 *   - Legacy session (missing MID) is cleared
 *   - MCE embed bypasses TSSD requirement
 * - GET /auth/me:
 *   - User or tenant not found deletes session, returns 401
 *   - Token refresh fails returns 401 with reauth_required
 * - GET /auth/refresh:
 *   - Happy path returns { ok: true }
 *   - Refresh failure returns error
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService, RlsContextService } from '@qpp/backend-shared';
import { ICredentialsRepository, tenants, users } from '@qpp/database';
import { createTestIds, externalOnlyOnUnhandledRequest } from '@qpp/test-utils';
import { eq } from 'drizzle-orm';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as jose from 'jose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import postgres from 'postgres';
import { Agent, agent as superagent } from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- `key` is a trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_TSSD = 'auth-endpoints-test-tssd';
const TEST_EID = `auth-endpoints-eid-${Date.now()}`;
const TEST_SF_USER_ID = `auth-endpoints-user-${Date.now()}`;
const TEST_MID = `auth-endpoints-mid-${Date.now()}`;

const defaultHandlers = [
  http.post(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`, () => {
    return HttpResponse.json({
      access_token: 'endpoints-test-access-token',
      refresh_token: 'endpoints-test-refresh-token',
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
        sub: TEST_SF_USER_ID,
        enterprise_id: TEST_EID,
        member_id: TEST_MID,
        email: 'endpoints-test@example.com',
        name: 'Auth Endpoints Test User',
      });
    },
  ),
];

const server = setupServer(...defaultHandlers);

describe('Auth endpoints (integration)', () => {
  let app: NestFastifyApplication;
  let module: TestingModule;
  let credRepo: ICredentialsRepository;
  let rlsContext: RlsContextService;
  let encryptionService: EncryptionService;

  let db: PostgresJsDatabase;
  let client: postgres.Sql;

  const createdTenantEids: string[] = [];
  const createdUserSfIds: string[] = [];

  const jwtSecret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
  const encodedSecret = new TextEncoder().encode(jwtSecret);

  async function createValidJwt(
    overrides: Partial<{
      user_id: string;
      enterprise_id: string;
      member_id: string;
      stack: string;
      exp: number;
    }> = {},
  ): Promise<string> {
    const payload = {
      user_id: overrides.user_id ?? TEST_SF_USER_ID,
      enterprise_id: overrides.enterprise_id ?? TEST_EID,
      member_id: overrides.member_id ?? TEST_MID,
      stack: overrides.stack ?? TEST_TSSD,
    };

    const builder = new jose.SignJWT(payload).setProtectedHeader({
      alg: 'HS256',
    });

    if (overrides.exp !== undefined) {
      builder.setExpirationTime(overrides.exp);
    } else {
      builder.setExpirationTime('1h');
    }

    return builder.sign(encodedSecret);
  }

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: externalOnlyOnUnhandledRequest() });

    process.env.MCE_TSSD = TEST_TSSD;

    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(
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

    // Test-only routes to read and seed session state (for legacy edge cases).
    // Must be registered before Fastify is ready.
    const fastify = app.getHttpAdapter().getInstance();
    type SecureSession = {
      get(key: string): unknown;
      set(key: string, value: unknown): void;
      delete(): void;
    };
    type RequestWithSession = { session?: SecureSession; query?: unknown };

    fastify.get('/__test/session', (req: unknown, reply: unknown) => {
      const request = req as RequestWithSession;
      const response = reply as { send: (body: unknown) => void };

      response.send({
        userId: request.session?.get('userId'),
        tenantId: request.session?.get('tenantId'),
        mid: request.session?.get('mid'),
        csrfToken: request.session?.get('csrfToken'),
      });
    });

    fastify.get('/__test/session/set', (req: unknown, reply: unknown) => {
      const request = req as RequestWithSession;
      const response = reply as { send: (body: unknown) => void };

      const query = (request.query ?? {}) as Record<string, unknown>;

      request.session?.set('userId', query.userId);
      request.session?.set('tenantId', query.tenantId);
      request.session?.set('mid', query.mid);

      response.send({ ok: true });
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    credRepo = module.get<ICredentialsRepository>('CREDENTIALS_REPOSITORY');
    rlsContext = module.get<RlsContextService>(RlsContextService);
    encryptionService = module.get<EncryptionService>(EncryptionService);

    client = postgres(getRequiredEnv('DATABASE_URL'));
    db = drizzle(client);
  });

  afterAll(async () => {
    server.close();

    // Clean up test data (in FK order: credentials -> users -> tenants)
    // Use raw SQL to bypass RLS and handle errors gracefully
    for (const sfUserId of createdUserSfIds) {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.sfUserId, sfUserId));
        if (user) {
          await client.unsafe('DELETE FROM credentials WHERE user_id = $1', [
            user.id,
          ]);
          await client.unsafe('DELETE FROM users WHERE sf_user_id = $1', [
            sfUserId,
          ]);
        }
      } catch {
        // ignore cleanup errors
      }
    }

    await client.unsafe(
      'ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_delete',
    );
    for (const eid of createdTenantEids) {
      try {
        await client.unsafe('DELETE FROM tenants WHERE eid = $1', [eid]);
      } catch {
        // ignore cleanup errors
      }
    }
    await client.unsafe(
      'ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_delete',
    );

    await client.end();
    await app.close();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('POST /auth/login variations', () => {
    it('should return JSON response when Accept: application/json', async () => {
      const uniqueEid = `json-login-eid-${Date.now()}`;
      const uniqueSfUserId = `json-login-user-${Date.now()}`;
      const uniqueMid = `json-login-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      const jwt = await createValidJwt({
        user_id: uniqueSfUserId,
        enterprise_id: uniqueEid,
        member_id: uniqueMid,
      });

      const response = await superagent(app.getHttpServer())
        .post('/auth/login')
        .set('Accept', 'application/json')
        .send({ jwt })
        .expect(200);

      expect(response.body).toEqual({ ok: true });
    });

    it('should accept JWT in body.token', async () => {
      const uniqueEid = `token-login-eid-${Date.now()}`;
      const uniqueSfUserId = `token-login-user-${Date.now()}`;
      const uniqueMid = `token-login-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      const jwt = await createValidJwt({
        user_id: uniqueSfUserId,
        enterprise_id: uniqueEid,
        member_id: uniqueMid,
      });

      await superagent(app.getHttpServer())
        .post('/auth/login')
        .send({ token: jwt })
        .expect(302);
    });

    it('should accept JWT in body.access_token', async () => {
      const uniqueEid = `access-token-login-eid-${Date.now()}`;
      const uniqueSfUserId = `access-token-login-user-${Date.now()}`;
      const uniqueMid = `access-token-login-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      const jwt = await createValidJwt({
        user_id: uniqueSfUserId,
        enterprise_id: uniqueEid,
        member_id: uniqueMid,
      });

      await superagent(app.getHttpServer())
        .post('/auth/login')
        .send({ access_token: jwt })
        .expect(302);
    });

    it('should accept JWT in body.accessToken', async () => {
      const uniqueEid = `accessToken-login-eid-${Date.now()}`;
      const uniqueSfUserId = `accessToken-login-user-${Date.now()}`;
      const uniqueMid = `accessToken-login-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      const jwt = await createValidJwt({
        user_id: uniqueSfUserId,
        enterprise_id: uniqueEid,
        member_id: uniqueMid,
      });

      await superagent(app.getHttpServer())
        .post('/auth/login')
        .send({ accessToken: jwt })
        .expect(302);
    });

    it('should accept JWT in body.JWT (uppercase)', async () => {
      const uniqueEid = `JWT-upper-login-eid-${Date.now()}`;
      const uniqueSfUserId = `JWT-upper-login-user-${Date.now()}`;
      const uniqueMid = `JWT-upper-login-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      const jwt = await createValidJwt({
        user_id: uniqueSfUserId,
        enterprise_id: uniqueEid,
        member_id: uniqueMid,
      });

      await superagent(app.getHttpServer())
        .post('/auth/login')
        .send({ JWT: jwt })
        .expect(302);
    });
  });

  describe('GET /auth/login edge cases', () => {
    it('should redirect to / if session already valid', async () => {
      const uniqueEid = `valid-session-eid-${Date.now()}`;
      const uniqueSfUserId = `valid-session-user-${Date.now()}`;
      const uniqueMid = `valid-session-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      const jwt = await createValidJwt({
        user_id: uniqueSfUserId,
        enterprise_id: uniqueEid,
        member_id: uniqueMid,
      });

      const testAgent = superagent(app.getHttpServer());

      await testAgent.post('/auth/login').send({ jwt }).expect(302);

      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      expect(loginResponse.headers.location).toBe('/');
    });

    it('should create session from JWT in query string', async () => {
      const uniqueEid = `query-jwt-eid-${Date.now()}`;
      const uniqueSfUserId = `query-jwt-user-${Date.now()}`;
      const uniqueMid = `query-jwt-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      const jwt = await createValidJwt({
        user_id: uniqueSfUserId,
        enterprise_id: uniqueEid,
        member_id: uniqueMid,
      });

      const testAgent = superagent(app.getHttpServer());

      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ jwt })
        .expect(302);

      expect(loginResponse.headers.location).toBe('/');

      const meResponse = await testAgent.get('/auth/me').expect(200);
      expect(meResponse.body.user.sfUserId).toBe(uniqueSfUserId);
    });

    it('should throw 401 when no TSSD and not MCE embed', async () => {
      const originalTssd = process.env.MCE_TSSD;
      delete process.env.MCE_TSSD;

      try {
        const response = await superagent(app.getHttpServer())
          .get('/auth/login')
          .expect(401);

        expect(response.body.detail).toContain('TSSD is required');
      } finally {
        process.env.MCE_TSSD = originalTssd;
      }
    });

    it('should clear legacy session missing MID and redirect to OAuth', async () => {
      const testAgent = superagent(app.getHttpServer());

      await testAgent
        .get('/__test/session/set')
        .query({ userId: 'legacy-user', tenantId: 'legacy-tenant' })
        .expect(200);

      const before = await testAgent.get('/__test/session').expect(200);
      expect(before.body.userId).toBe('legacy-user');
      expect(before.body.tenantId).toBe('legacy-tenant');
      expect(before.body.mid).toBeUndefined();

      const loginResponse = await testAgent.get('/auth/login').expect(302);
      expect(loginResponse.headers.location).toContain('/v2/authorize');

      const after = await testAgent.get('/__test/session').expect(200);
      expect(after.body.userId).toBeUndefined();
      expect(after.body.tenantId).toBeUndefined();
      expect(after.body.mid).toBeUndefined();
    });

    it('should bypass TSSD requirement when MCE embed (sec-fetch-dest: iframe)', async () => {
      const originalTssd = process.env.MCE_TSSD;
      delete process.env.MCE_TSSD;

      try {
        const response = await superagent(app.getHttpServer())
          .get('/auth/login')
          .set('sec-fetch-dest', 'iframe')
          .expect(302);

        expect(response.headers.location).toBe('/');
      } finally {
        process.env.MCE_TSSD = originalTssd;
      }
    });

    it('should bypass TSSD requirement when MCE embed (referer from exacttarget.com)', async () => {
      const originalTssd = process.env.MCE_TSSD;
      delete process.env.MCE_TSSD;

      try {
        const response = await superagent(app.getHttpServer())
          .get('/auth/login')
          .set('referer', 'https://mc.exacttarget.com/cloud')
          .expect(302);

        expect(response.headers.location).toBe('/');
      } finally {
        process.env.MCE_TSSD = originalTssd;
      }
    });
  });

  describe('GET /auth/me error paths', () => {
    let testAgent: Agent;

    beforeEach(() => {
      testAgent = superagent(app.getHttpServer());
    });

    it('should return 401 with reauth_required when token refresh fails', async () => {
      const uniqueEid = `reauth-eid-${Date.now()}`;
      const uniqueSfUserId = `reauth-user-${Date.now()}`;
      const uniqueMid = `reauth-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      server.use(
        http.get(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
          () => {
            return HttpResponse.json({
              sub: uniqueSfUserId,
              enterprise_id: uniqueEid,
              member_id: uniqueMid,
            });
          },
        ),
      );

      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResponse.headers.location;
      if (!redirectUrl) {
        throw new Error('OAuth login redirect missing location header');
      }
      const state = new URL(redirectUrl).searchParams.get('state');
      if (!state) {
        throw new Error('OAuth login redirect missing state param');
      }

      await testAgent
        .get('/auth/callback')
        .query({
          code: 'test-code',
          state,
          sf_user_id: uniqueSfUserId,
          eid: uniqueEid,
          mid: uniqueMid,
        })
        .expect(302);

      server.use(
        http.post(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          () => {
            return HttpResponse.json(
              { error: 'invalid_grant', error_description: 'Token expired' },
              { status: 401 },
            );
          },
        ),
      );

      const [dbTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.eid, uniqueEid));

      const [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.sfUserId, uniqueSfUserId));

      if (dbTenant && dbUser) {
        const encryptedAccessToken = encryptionService.encrypt('expired-token');
        const encryptedRefreshToken =
          encryptionService.encrypt('expired-refresh');
        if (!encryptedAccessToken || !encryptedRefreshToken) {
          throw new Error('Expected encrypted credentials for test');
        }

        await rlsContext.runWithTenantContext(
          dbTenant.id,
          uniqueMid,
          async () => {
            await credRepo.upsert({
              tenantId: dbTenant.id,
              userId: dbUser.id,
              mid: uniqueMid,
              accessToken: encryptedAccessToken,
              refreshToken: encryptedRefreshToken,
              expiresAt: new Date(0),
              updatedAt: new Date(),
            });
          },
        );
      }

      const meResponse = await testAgent.get('/auth/me').expect(401);
      expect(meResponse.body.reason).toBe('reauth_required');
    });

    it('should delete session and return 401 when user or tenant not found', async () => {
      const { tenantId, userId, mid } = createTestIds({
        mid: 'non-existent-mid',
      });

      await testAgent
        .get('/__test/session/set')
        .query({
          userId,
          tenantId,
          mid,
        })
        .expect(200);

      const before = await testAgent.get('/__test/session').expect(200);
      expect(before.body.userId).toBe(userId);
      expect(before.body.tenantId).toBe(tenantId);
      expect(before.body.mid).toBe(mid);

      const meResponse = await testAgent.get('/auth/me').expect(401);
      expect(meResponse.body.type).toBe('urn:qpp:error:http-401');

      const after = await testAgent.get('/__test/session').expect(200);
      expect(after.body.userId).toBeUndefined();
      expect(after.body.tenantId).toBeUndefined();
      expect(after.body.mid).toBeUndefined();
    });
  });

  describe('GET /auth/refresh', () => {
    it('should refresh token and return ok', async () => {
      const uniqueEid = `refresh-ok-eid-${Date.now()}`;
      const uniqueSfUserId = `refresh-ok-user-${Date.now()}`;
      const uniqueMid = `refresh-ok-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      server.use(
        http.get(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
          () => {
            return HttpResponse.json({
              sub: uniqueSfUserId,
              enterprise_id: uniqueEid,
              member_id: uniqueMid,
            });
          },
        ),
      );

      const testAgent = superagent(app.getHttpServer());

      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResponse.headers.location;
      if (!redirectUrl) {
        throw new Error('OAuth login redirect missing location header');
      }
      const state = new URL(redirectUrl).searchParams.get('state');
      if (!state) {
        throw new Error('OAuth login redirect missing state param');
      }

      await testAgent
        .get('/auth/callback')
        .query({
          code: 'test-code',
          state,
          sf_user_id: uniqueSfUserId,
          eid: uniqueEid,
          mid: uniqueMid,
        })
        .expect(302);

      const [dbTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.eid, uniqueEid));

      const [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.sfUserId, uniqueSfUserId));

      if (dbTenant && dbUser) {
        const encryptedAccessToken = encryptionService.encrypt('expired-token');
        const encryptedRefreshToken =
          encryptionService.encrypt('expired-refresh');
        if (!encryptedAccessToken || !encryptedRefreshToken) {
          throw new Error('Expected encrypted credentials for test');
        }

        await rlsContext.runWithTenantContext(
          dbTenant.id,
          uniqueMid,
          async () => {
            await credRepo.upsert({
              tenantId: dbTenant.id,
              userId: dbUser.id,
              mid: uniqueMid,
              accessToken: encryptedAccessToken,
              refreshToken: encryptedRefreshToken,
              expiresAt: new Date(0),
              updatedAt: new Date(),
            });
          },
        );
      }

      const refreshResponse = await testAgent.get('/auth/refresh').expect(200);
      expect(refreshResponse.body).toEqual({ ok: true });
    });

    it('should throw error when token refresh fails', async () => {
      const uniqueEid = `refresh-fail-eid-${Date.now()}`;
      const uniqueSfUserId = `refresh-fail-user-${Date.now()}`;
      const uniqueMid = `refresh-fail-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      server.use(
        http.get(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
          () => {
            return HttpResponse.json({
              sub: uniqueSfUserId,
              enterprise_id: uniqueEid,
              member_id: uniqueMid,
            });
          },
        ),
      );

      const testAgent = superagent(app.getHttpServer());

      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResponse.headers.location;
      if (!redirectUrl) {
        throw new Error('OAuth login redirect missing location header');
      }
      const state = new URL(redirectUrl).searchParams.get('state');
      if (!state) {
        throw new Error('OAuth login redirect missing state param');
      }

      await testAgent
        .get('/auth/callback')
        .query({
          code: 'test-code',
          state,
          sf_user_id: uniqueSfUserId,
          eid: uniqueEid,
          mid: uniqueMid,
        })
        .expect(302);

      server.use(
        http.post(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          () => {
            return HttpResponse.json(
              {
                error: 'access_denied',
                error_description: 'User revoked access',
              },
              { status: 401 },
            );
          },
        ),
      );

      const [dbTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.eid, uniqueEid));

      const [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.sfUserId, uniqueSfUserId));

      if (dbTenant && dbUser) {
        const encryptedAccessToken = encryptionService.encrypt('expired-token');
        const encryptedRefreshToken =
          encryptionService.encrypt('expired-refresh');
        if (!encryptedAccessToken || !encryptedRefreshToken) {
          throw new Error('Expected encrypted credentials for test');
        }

        await rlsContext.runWithTenantContext(
          dbTenant.id,
          uniqueMid,
          async () => {
            await credRepo.upsert({
              tenantId: dbTenant.id,
              userId: dbUser.id,
              mid: uniqueMid,
              accessToken: encryptedAccessToken,
              refreshToken: encryptedRefreshToken,
              expiresAt: new Date(0),
              updatedAt: new Date(),
            });
          },
        );
      }

      const refreshResponse = await testAgent.get('/auth/refresh').expect(401);
      expect(refreshResponse.body.type).toBe('urn:qpp:error:mce-auth-expired');
    });
  });
});
