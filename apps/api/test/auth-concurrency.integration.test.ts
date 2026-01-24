/**
 * Auth Concurrency Integration Tests
 *
 * Tests the refreshToken race condition deduplication behavior to ensure:
 * 1. Concurrent refresh requests are deduplicated - only 1 MCE token request occurs
 * 2. All concurrent callers receive the same refreshed token
 * 3. Non-force refresh uses cached token (no MCE call)
 * 4. Sequential calls after token expiry make separate requests
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AuthService,
  EncryptionService,
  RlsContextService,
} from '@qpp/backend-shared';
import {
  ICredentialsRepository,
  ITenantRepository,
  IUserRepository,
} from '@qpp/database';
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

const TEST_TSSD = 'auth-concurrency-test-tssd';

// Default MSW handlers
const defaultHandlers = [
  http.post(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`, () => {
    return HttpResponse.json({
      access_token: 'default-access-token',
      refresh_token: 'default-refresh-token',
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
        sub: 'concurrency-test-user',
        enterprise_id: 'concurrency-test-eid',
        member_id: 'concurrency-test-mid',
        email: 'concurrency-test@example.com',
        name: 'Concurrency Test User',
      });
    },
  ),
];

const server = setupServer(...defaultHandlers);

describe('Auth Concurrency (integration)', () => {
  let app: NestFastifyApplication;
  let module: TestingModule;
  let authService: AuthService;
  let tenantRepo: ITenantRepository;
  let userRepo: IUserRepository;
  let credRepo: ICredentialsRepository;
  let rlsContext: RlsContextService;
  let encryptionService: EncryptionService;

  // Direct database access for test data setup (raw SQL bypasses RLS)
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
    tenantRepo = module.get<ITenantRepository>('TENANT_REPOSITORY');
    userRepo = module.get<IUserRepository>('USER_REPOSITORY');
    credRepo = module.get<ICredentialsRepository>('CREDENTIALS_REPOSITORY');
    rlsContext = module.get<RlsContextService>(RlsContextService);
    encryptionService = module.get<EncryptionService>(EncryptionService);

    // Direct database connection for setup and cleanup (raw SQL bypasses RLS)
    client = postgres(getRequiredEnv('DATABASE_URL'));
  });

  afterAll(async () => {
    server.close();

    // Clean up test data (FK order: credentials -> users -> tenants)
    // Use raw SQL to bypass RLS policies that would hide rows
    try {
      for (const sfUserId of createdUserSfIds) {
        // Get user ID first, then delete credentials, then user
        const [user] =
          await client`SELECT id FROM users WHERE sf_user_id = ${sfUserId}`;
        if (user?.id) {
          await client`DELETE FROM credentials WHERE user_id = ${user.id}`;
          await client`DELETE FROM users WHERE id = ${user.id}`;
        }
      }

      for (const eid of createdTenantEids) {
        await client`DELETE FROM tenants WHERE eid = ${eid}`;
      }
    } catch (cleanupError) {
      // Log but don't fail tests - cleanup errors shouldn't mask test results
      console.warn('Test cleanup warning:', cleanupError);
    }

    await client.end();
    await app.close();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('refreshToken race condition', () => {
    it('should deduplicate concurrent refresh requests - only 1 MCE token request occurs', async () => {
      const uniqueEid = `race-eid-${Date.now()}`;
      const uniqueSfUserId = `race-user-${Date.now()}`;
      const uniqueMid = `race-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      // Create tenant and user directly
      const tenant = await tenantRepo.upsert({
        eid: uniqueEid,
        tssd: TEST_TSSD,
      });
      const user = await userRepo.upsert({
        sfUserId: uniqueSfUserId,
        tenantId: tenant.id,
      });

      // Create expired credentials to force refresh
      const encryptedAccessToken = encryptionService.encrypt(
        'expired-access-token',
      ) as string;
      const encryptedRefreshToken = encryptionService.encrypt(
        'valid-refresh-token',
      ) as string;

      await rlsContext.runWithTenantContext(tenant.id, uniqueMid, async () => {
        await credRepo.upsert({
          tenantId: tenant.id,
          userId: user.id,
          mid: uniqueMid,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
          updatedAt: new Date(),
        });
      });

      // Track MCE token requests
      let tokenRequestCount = 0;

      server.use(
        http.post(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          async () => {
            tokenRequestCount++;
            // Add a small delay to ensure concurrency is tested
            await new Promise((resolve) => setTimeout(resolve, 50));
            return HttpResponse.json({
              access_token: 'refreshed-token',
              refresh_token: 'new-refresh-token',
              expires_in: 3600,
              rest_instance_url: 'https://test-rest.com',
              soap_instance_url: `https://${TEST_TSSD}.soap.marketingcloudapis.com`,
              scope: 'read write',
              token_type: 'Bearer',
            });
          },
        ),
      );

      // Fire 5 concurrent refresh calls with forceRefresh=true
      const results = await rlsContext.runWithTenantContext(
        tenant.id,
        uniqueMid,
        () =>
          Promise.all([
            authService.refreshToken(tenant.id, user.id, uniqueMid, true),
            authService.refreshToken(tenant.id, user.id, uniqueMid, true),
            authService.refreshToken(tenant.id, user.id, uniqueMid, true),
            authService.refreshToken(tenant.id, user.id, uniqueMid, true),
            authService.refreshToken(tenant.id, user.id, uniqueMid, true),
          ]),
      );

      // Verify only 1 MCE /token request occurred
      expect(tokenRequestCount).toBe(1);

      // Verify all 5 calls return the same access token
      const accessTokens = results.map((r) => r.accessToken);
      expect(new Set(accessTokens).size).toBe(1);
      expect(accessTokens[0]).toBe('refreshed-token');

      // Verify all return the same TSSD
      const tssds = results.map((r) => r.tssd);
      expect(new Set(tssds).size).toBe(1);
      expect(tssds[0]).toBe(TEST_TSSD);
    });

    it('should use cached token when not forcing refresh and token is valid', async () => {
      const uniqueEid = `cached-eid-${Date.now()}`;
      const uniqueSfUserId = `cached-user-${Date.now()}`;
      const uniqueMid = `cached-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      // Create tenant and user
      const tenant = await tenantRepo.upsert({
        eid: uniqueEid,
        tssd: TEST_TSSD,
      });
      const user = await userRepo.upsert({
        sfUserId: uniqueSfUserId,
        tenantId: tenant.id,
      });

      // Create VALID credentials (not expired)
      const encryptedAccessToken = encryptionService.encrypt(
        'cached-valid-token',
      ) as string;
      const encryptedRefreshToken = encryptionService.encrypt(
        'cached-refresh-token',
      ) as string;

      await rlsContext.runWithTenantContext(tenant.id, uniqueMid, async () => {
        await credRepo.upsert({
          tenantId: tenant.id,
          userId: user.id,
          mid: uniqueMid,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: new Date(Date.now() + 3600 * 1000), // Valid for 1 hour
          updatedAt: new Date(),
        });
      });

      // Track MCE token requests
      let tokenRequestCount = 0;

      server.use(
        http.post(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          () => {
            tokenRequestCount++;
            return HttpResponse.json({
              access_token: 'should-not-be-used',
              refresh_token: 'should-not-be-used',
              expires_in: 3600,
            });
          },
        ),
      );

      // Call refreshToken without forceRefresh (default is false)
      const result = await rlsContext.runWithTenantContext(
        tenant.id,
        uniqueMid,
        () => authService.refreshToken(tenant.id, user.id, uniqueMid, false),
      );

      // Verify NO MCE token request occurred - cached token was used
      expect(tokenRequestCount).toBe(0);

      // Verify the cached token was returned (decrypted)
      expect(result.accessToken).toBe('cached-valid-token');
      expect(result.tssd).toBe(TEST_TSSD);
    });

    it('should refresh sequentially when token expires between calls', async () => {
      const uniqueEid = `sequential-eid-${Date.now()}`;
      const uniqueSfUserId = `sequential-user-${Date.now()}`;
      const uniqueMid = `sequential-mid-${Date.now()}`;

      createdTenantEids.push(uniqueEid);
      createdUserSfIds.push(uniqueSfUserId);

      // Create tenant and user
      const tenant = await tenantRepo.upsert({
        eid: uniqueEid,
        tssd: TEST_TSSD,
      });
      const user = await userRepo.upsert({
        sfUserId: uniqueSfUserId,
        tenantId: tenant.id,
      });

      // Create expired credentials
      const encryptedAccessToken = encryptionService.encrypt(
        'expired-token',
      ) as string;
      const encryptedRefreshToken = encryptionService.encrypt(
        'refresh-token',
      ) as string;

      await rlsContext.runWithTenantContext(tenant.id, uniqueMid, async () => {
        await credRepo.upsert({
          tenantId: tenant.id,
          userId: user.id,
          mid: uniqueMid,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: new Date(Date.now() - 1000), // Expired
          updatedAt: new Date(),
        });
      });

      // Track MCE token requests - return different token each time
      let tokenRequestCount = 0;

      server.use(
        http.post(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          () => {
            tokenRequestCount++;
            return HttpResponse.json({
              access_token: `refreshed-token-${tokenRequestCount}`,
              refresh_token: `new-refresh-${tokenRequestCount}`,
              expires_in: 1, // Expires in 1 second (will be expired for next call)
              rest_instance_url: 'https://test-rest.com',
              soap_instance_url: `https://${TEST_TSSD}.soap.marketingcloudapis.com`,
              scope: 'read write',
              token_type: 'Bearer',
            });
          },
        ),
      );

      // First sequential call with forceRefresh
      const result1 = await rlsContext.runWithTenantContext(
        tenant.id,
        uniqueMid,
        () => authService.refreshToken(tenant.id, user.id, uniqueMid, true),
      );

      // Wait to ensure no concurrent lock is held
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second sequential call with forceRefresh
      const result2 = await rlsContext.runWithTenantContext(
        tenant.id,
        uniqueMid,
        () => authService.refreshToken(tenant.id, user.id, uniqueMid, true),
      );

      // Verify 2 separate MCE token requests occurred
      expect(tokenRequestCount).toBe(2);

      // Verify each call got a different token
      expect(result1.accessToken).toBe('refreshed-token-1');
      expect(result2.accessToken).toBe('refreshed-token-2');
    });
  });
});
