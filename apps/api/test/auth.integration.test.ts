/**
 * AuthService Integration Tests
 *
 * This integration test replaces the previous mock-heavy unit tests:
 * - auth.service.unit.test.ts (deleted - was mock-heavy with 7 mocks)
 * - jwt.unit.test.ts (deleted - merged into E2E tests)
 *
 * Test Strategy:
 * - Real NestJS app with FastifyAdapter
 * - Real PostgreSQL database (RLS-enabled)
 * - MSW for MCE API mocking (external boundary only)
 * - No internal service mocking - behavioral assertions only
 *
 * Covered Behaviors (from surface-area/auth.md):
 * - handleJwtLogin creates tenant and user on first login
 * - handleJwtLogin returns existing user on repeat login
 * - handleJwtLogin rejects expired JWT
 * - handleJwtLogin rejects JWT with wrong signature
 * - handleCallback exchanges code for tokens and stores credentials
 * - handleCallback detects identity mismatch
 * - handleCallback handles MCE token endpoint error
 * - refreshToken updates credentials in database
 * - refreshToken handles expired refresh token
 * - invalidateToken deletes credentials from database
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService, RlsContextService } from '@qpp/backend-shared';
import {
  credentials,
  ICredentialsRepository,
  IUserRepository,
  tenants,
  users,
} from '@qpp/database';
import { eq } from 'drizzle-orm';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as jose from 'jose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

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

const TEST_TSSD = 'auth-int-test-tssd';
const TEST_EID = `auth-int-test-eid-${Date.now()}`;
const TEST_SF_USER_ID = `auth-int-test-user-${Date.now()}`;
const TEST_MID = `auth-int-test-mid-${Date.now()}`;

// Default MSW handlers for happy path
const defaultHandlers = [
  http.post(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`, () => {
    return HttpResponse.json({
      access_token: 'int-test-access-token',
      refresh_token: 'int-test-refresh-token',
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
        email: 'integration-test@example.com',
        name: 'Integration Test User',
      });
    },
  ),
];

const server = setupServer(...defaultHandlers);

describe('AuthService (integration)', () => {
  let app: NestFastifyApplication;
  let module: TestingModule;
  let authService: AuthService;
  let userRepo: IUserRepository;
  let credRepo: ICredentialsRepository;
  let rlsContext: RlsContextService;

  // Direct database access for verification
  let db: PostgresJsDatabase;
  let client: postgres.Sql;

  // Track created entities for cleanup
  const createdTenantEids: string[] = [];
  const createdUserSfIds: string[] = [];

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' });

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

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // Get services from the module
    authService = module.get<AuthService>(AuthService);
    userRepo = module.get<IUserRepository>('USER_REPOSITORY');
    credRepo = module.get<ICredentialsRepository>('CREDENTIALS_REPOSITORY');
    rlsContext = module.get<RlsContextService>(RlsContextService);

    // Direct database connection for verification
    client = postgres(getRequiredEnv('DATABASE_URL'));
    db = drizzle(client);
  });

  afterAll(async () => {
    server.close();

    // Clean up test data (in FK order: credentials -> users -> tenants)
    for (const sfUserId of createdUserSfIds) {
      const user = await userRepo.findBySfUserId(sfUserId);
      if (user) {
        await db.delete(credentials).where(eq(credentials.userId, user.id));
        await db.delete(users).where(eq(users.sfUserId, sfUserId));
      }
    }

    for (const eid of createdTenantEids) {
      await db.delete(tenants).where(eq(tenants.eid, eid));
    }

    await client.end();
    await app.close();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('handleJwtLogin', () => {
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

    it('should create tenant and user on first login', async () => {
      const uniqueEid = `first-login-eid-${Date.now()}`;
      const uniqueSfUserId = `first-login-user-${Date.now()}`;
      const uniqueMid = `first-login-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      const jwt = await createValidJwt({
        user_id: uniqueSfUserId,
        enterprise_id: uniqueEid,
        member_id: uniqueMid,
      });

      const result = await authService.handleJwtLogin(jwt);

      // Verify returned data
      expect(result.user.sfUserId).toBe(uniqueSfUserId);
      expect(result.tenant.eid).toBe(uniqueEid);
      expect(result.mid).toBe(uniqueMid);

      // Verify tenant created in database
      const [dbTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.eid, uniqueEid));
      expect(dbTenant).toBeDefined();
      expect(dbTenant?.tssd).toBe(TEST_TSSD);

      // Verify user created in database
      const [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.sfUserId, uniqueSfUserId));
      expect(dbUser).toBeDefined();
      expect(dbUser?.tenantId).toBe(dbTenant?.id);
    });

    it('should return existing user on repeat login', async () => {
      const uniqueEid = `repeat-login-eid-${Date.now()}`;
      const uniqueSfUserId = `repeat-login-user-${Date.now()}`;
      const uniqueMid = `repeat-login-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      const jwt = await createValidJwt({
        user_id: uniqueSfUserId,
        enterprise_id: uniqueEid,
        member_id: uniqueMid,
      });

      // First login
      const firstResult = await authService.handleJwtLogin(jwt);
      const firstUserId = firstResult.user.id;
      const firstTenantId = firstResult.tenant.id;

      // Second login (same JWT)
      const secondResult = await authService.handleJwtLogin(jwt);

      // Verify same user and tenant returned
      expect(secondResult.user.id).toBe(firstUserId);
      expect(secondResult.tenant.id).toBe(firstTenantId);

      // Verify only ONE tenant record exists
      const tenantCount = await db
        .select()
        .from(tenants)
        .where(eq(tenants.eid, uniqueEid));
      expect(tenantCount).toHaveLength(1);

      // Verify only ONE user record exists
      const userCount = await db
        .select()
        .from(users)
        .where(eq(users.sfUserId, uniqueSfUserId));
      expect(userCount).toHaveLength(1);
    });

    it('should reject expired JWT', async () => {
      const expiredJwt = await createValidJwt({
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      });

      await expect(authService.handleJwtLogin(expiredJwt)).rejects.toThrow();
    });

    it('should reject JWT with wrong signature', async () => {
      const wrongSecret = new TextEncoder().encode(
        'wrong-secret-that-is-at-least-32-chars-long',
      );

      const badJwt = await new jose.SignJWT({
        user_id: TEST_SF_USER_ID,
        enterprise_id: TEST_EID,
        member_id: TEST_MID,
        stack: TEST_TSSD,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(wrongSecret);

      await expect(authService.handleJwtLogin(badJwt)).rejects.toThrow();
    });

    it('should reject JWT with missing required claims', async () => {
      // JWT without enterprise_id and member_id
      const incompleteJwt = await new jose.SignJWT({
        user_id: TEST_SF_USER_ID,
        stack: TEST_TSSD,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(encodedSecret);

      await expect(authService.handleJwtLogin(incompleteJwt)).rejects.toThrow();
    });
  });

  describe('handleCallback', () => {
    it('should exchange code for tokens and store credentials', async () => {
      const uniqueEid = `callback-eid-${Date.now()}`;
      const uniqueSfUserId = `callback-user-${Date.now()}`;
      const uniqueMid = `callback-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      // Configure MSW to return specific user info
      server.use(
        http.get(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
          () => {
            return HttpResponse.json({
              sub: uniqueSfUserId,
              enterprise_id: uniqueEid,
              member_id: uniqueMid,
              email: 'callback@example.com',
              name: 'Callback User',
            });
          },
        ),
      );

      const result = await authService.handleCallback(
        TEST_TSSD,
        'valid-auth-code',
      );

      // Verify returned data
      expect(result.user.sfUserId).toBe(uniqueSfUserId);
      expect(result.tenant.eid).toBe(uniqueEid);
      expect(result.mid).toBe(uniqueMid);

      // Verify tenant and user created
      const [dbTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.eid, uniqueEid));
      expect(dbTenant).toBeDefined();
      if (!dbTenant) {
        throw new Error('dbTenant not found');
      }

      const [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.sfUserId, uniqueSfUserId));
      expect(dbUser).toBeDefined();
      if (!dbUser) {
        throw new Error('dbUser not found');
      }

      // Verify credentials stored (via RLS context)
      const dbCreds = await rlsContext.runWithTenantContext(
        dbTenant.id,
        uniqueMid,
        () => credRepo.findByUserTenantMid(dbUser.id, dbTenant.id, uniqueMid),
      );
      expect(dbCreds).toBeDefined();
      expect(dbCreds?.accessToken).toBeDefined();
      expect(dbCreds?.refreshToken).toBeDefined();
    });

    it('should detect identity mismatch when sfUserId differs', async () => {
      const uniqueEid = `mismatch-eid-${Date.now()}`;
      const uniqueSfUserId = `mismatch-user-${Date.now()}`;
      const uniqueMid = `mismatch-mid-${Date.now()}`;

      // MSW returns 'legitimate-user' but we pass 'attacker-user' as sfUserId
      server.use(
        http.get(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
          () => {
            return HttpResponse.json({
              sub: uniqueSfUserId, // Real user ID from MCE
              enterprise_id: uniqueEid,
              member_id: uniqueMid,
            });
          },
        ),
      );

      // Pass different sfUserId (attack attempt)
      await expect(
        authService.handleCallback(
          TEST_TSSD,
          'valid-auth-code',
          'attacker-user-id', // Different from what userinfo returns
          uniqueEid,
          undefined,
          undefined,
          uniqueMid,
        ),
      ).rejects.toThrow();
    });

    it('should detect identity mismatch when eid differs', async () => {
      const uniqueEid = `eid-mismatch-${Date.now()}`;
      const uniqueSfUserId = `eid-mismatch-user-${Date.now()}`;
      const uniqueMid = `eid-mismatch-mid-${Date.now()}`;

      server.use(
        http.get(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
          () => {
            return HttpResponse.json({
              sub: uniqueSfUserId,
              enterprise_id: uniqueEid, // Real EID
              member_id: uniqueMid,
            });
          },
        ),
      );

      // Pass different eid (attack attempt)
      await expect(
        authService.handleCallback(
          TEST_TSSD,
          'valid-auth-code',
          uniqueSfUserId,
          'attacker-eid', // Different from what userinfo returns
          undefined,
          undefined,
          uniqueMid,
        ),
      ).rejects.toThrow();
    });

    it('should detect identity mismatch when mid differs', async () => {
      const uniqueEid = `mid-mismatch-eid-${Date.now()}`;
      const uniqueSfUserId = `mid-mismatch-user-${Date.now()}`;
      const uniqueMid = `mid-mismatch-mid-${Date.now()}`;

      server.use(
        http.get(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
          () => {
            return HttpResponse.json({
              sub: uniqueSfUserId,
              enterprise_id: uniqueEid,
              member_id: uniqueMid, // Real MID
            });
          },
        ),
      );

      // Pass different mid (attack attempt)
      await expect(
        authService.handleCallback(
          TEST_TSSD,
          'valid-auth-code',
          uniqueSfUserId,
          uniqueEid,
          undefined,
          undefined,
          'attacker-mid', // Different from what userinfo returns
        ),
      ).rejects.toThrow();
    });

    it('should handle MCE token endpoint error', async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          () => {
            return HttpResponse.json(
              { error: 'server_error', error_description: 'Internal error' },
              { status: 500 },
            );
          },
        ),
      );

      await expect(
        authService.handleCallback(TEST_TSSD, 'any-code'),
      ).rejects.toThrow();
    });
  });

  describe('refreshToken', () => {
    it('should refresh tokens and update credentials in database', async () => {
      const uniqueEid = `refresh-eid-${Date.now()}`;
      const uniqueSfUserId = `refresh-user-${Date.now()}`;
      const uniqueMid = `refresh-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      // Configure MSW for this user
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

      // First create user and credentials via callback
      const callbackResult = await authService.handleCallback(
        TEST_TSSD,
        'initial-code',
      );

      const tenantId = callbackResult.tenant.id;
      const userId = callbackResult.user.id;

      // Get initial credentials (within RLS context)
      const initialCreds = await rlsContext.runWithTenantContext(
        tenantId,
        uniqueMid,
        () => credRepo.findByUserTenantMid(userId, tenantId, uniqueMid),
      );
      const initialUpdatedAt = initialCreds?.updatedAt;

      // Wait a small amount to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Configure MSW to return refreshed tokens
      server.use(
        http.post(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          () => {
            return HttpResponse.json({
              access_token: 'refreshed-access-token',
              refresh_token: 'refreshed-refresh-token',
              expires_in: 3600,
              rest_instance_url: 'https://test-rest.com',
              soap_instance_url: `https://${TEST_TSSD}.soap.marketingcloudapis.com`,
              scope: 'read write',
              token_type: 'Bearer',
            });
          },
        ),
      );

      // Force refresh (within RLS context)
      const refreshResult = await rlsContext.runWithTenantContext(
        tenantId,
        uniqueMid,
        () => authService.refreshToken(tenantId, userId, uniqueMid, true),
      );

      // Verify new access token returned
      expect(refreshResult.accessToken).toBe('refreshed-access-token');
      expect(refreshResult.tssd).toBe(TEST_TSSD);

      // Verify credentials updated in database
      const updatedCreds = await rlsContext.runWithTenantContext(
        tenantId,
        uniqueMid,
        () => credRepo.findByUserTenantMid(userId, tenantId, uniqueMid),
      );
      expect(updatedCreds?.updatedAt).not.toEqual(initialUpdatedAt);
    });

    it('should handle expired refresh token (invalid_grant)', async () => {
      const uniqueEid = `expired-refresh-eid-${Date.now()}`;
      const uniqueSfUserId = `expired-refresh-user-${Date.now()}`;
      const uniqueMid = `expired-refresh-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      // Configure MSW for this user
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

      // First create user and credentials via callback
      const callbackResult = await authService.handleCallback(
        TEST_TSSD,
        'initial-code',
      );

      const tenantId = callbackResult.tenant.id;
      const userId = callbackResult.user.id;

      // Configure MSW to return invalid_grant error
      server.use(
        http.post(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          () => {
            return HttpResponse.json(
              { error: 'invalid_grant', error_description: 'Grant expired' },
              { status: 401 },
            );
          },
        ),
      );

      // Force refresh should fail with reauth required (within RLS context)
      await expect(
        rlsContext.runWithTenantContext(tenantId, uniqueMid, () =>
          authService.refreshToken(tenantId, userId, uniqueMid, true),
        ),
      ).rejects.toThrow();
    });

    it('should handle access_denied error', async () => {
      const uniqueEid = `access-denied-eid-${Date.now()}`;
      const uniqueSfUserId = `access-denied-user-${Date.now()}`;
      const uniqueMid = `access-denied-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      // Configure MSW for this user
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

      // First create user and credentials via callback
      const callbackResult = await authService.handleCallback(
        TEST_TSSD,
        'initial-code',
      );

      const tenantId = callbackResult.tenant.id;
      const userId = callbackResult.user.id;

      // Configure MSW to return access_denied error
      server.use(
        http.post(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          () => {
            return HttpResponse.json(
              { error: 'access_denied', error_description: 'Access revoked' },
              { status: 401 },
            );
          },
        ),
      );

      // Force refresh should fail (within RLS context)
      await expect(
        rlsContext.runWithTenantContext(tenantId, uniqueMid, () =>
          authService.refreshToken(tenantId, userId, uniqueMid, true),
        ),
      ).rejects.toThrow();
    });
  });

  describe('invalidateToken', () => {
    it('should invalidate credentials by setting expiry to epoch 0', async () => {
      const uniqueEid = `invalidate-eid-${Date.now()}`;
      const uniqueSfUserId = `invalidate-user-${Date.now()}`;
      const uniqueMid = `invalidate-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      // Configure MSW for this user
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

      // First create user and credentials via callback
      const callbackResult = await authService.handleCallback(
        TEST_TSSD,
        'initial-code',
      );

      const tenantId = callbackResult.tenant.id;
      const userId = callbackResult.user.id;

      // Verify credentials exist with future expiry
      const initialCreds = await credRepo.findByUserTenantMid(
        userId,
        tenantId,
        uniqueMid,
      );
      expect(initialCreds).toBeDefined();
      expect(initialCreds?.expiresAt).toBeDefined();
      if (!initialCreds) {
        throw new Error('initialCreds not found');
      }
      expect(new Date(initialCreds.expiresAt).getTime()).toBeGreaterThan(
        Date.now(),
      );

      // Invalidate token
      await authService.invalidateToken(tenantId, userId, uniqueMid);

      // Verify credentials have epoch 0 expiry
      const invalidatedCreds = await credRepo.findByUserTenantMid(
        userId,
        tenantId,
        uniqueMid,
      );
      expect(invalidatedCreds).toBeDefined();
      if (!invalidatedCreds) {
        throw new Error('invalidatedCreds not found');
      }
      expect(new Date(invalidatedCreds.expiresAt).getTime()).toBe(0);
    });

    it('should handle invalidation of non-existent credentials gracefully', async () => {
      // Should not throw when credentials don't exist
      await expect(
        authService.invalidateToken(
          'non-existent-tenant',
          'non-existent-user',
          'non-existent-mid',
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('verifyMceJwt (pure JWT validation)', () => {
    const jwtSecret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
    const encodedSecret = new TextEncoder().encode(jwtSecret);

    it('should extract TSSD from application_context.base_url if stack is missing', async () => {
      const jwt = await new jose.SignJWT({
        user_id: 'context-user',
        enterprise_id: 'context-eid',
        member_id: 'context-mid',
        application_context: {
          base_url: 'https://mc-xyz123.rest.marketingcloudapis.com/',
        },
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(encodedSecret);

      const result = await authService.verifyMceJwt(jwt);
      expect(result.tssd).toBe('mc-xyz123');
    });

    it('should prefer stack over application_context', async () => {
      const jwt = await new jose.SignJWT({
        user_id: 'stack-user',
        enterprise_id: 'stack-eid',
        member_id: 'stack-mid',
        stack: 's11',
        application_context: {
          base_url: 'https://mc-xyz123.rest.marketingcloudapis.com/',
        },
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(encodedSecret);

      const result = await authService.verifyMceJwt(jwt);
      expect(result.tssd).toBe('s11');
    });
  });
});
