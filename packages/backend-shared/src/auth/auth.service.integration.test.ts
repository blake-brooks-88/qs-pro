/**
 * Integration tests for AuthService authentication flows.
 *
 * These tests verify:
 * 1. handleJwtLogin: JWT verification, tenant/user creation, token storage
 * 2. handleCallback: OAuth code exchange, user info fetch, identity validation
 * 3. refreshToken: Cached token return, token refresh via MCE API
 * 4. invalidateToken: Token expiration marking
 *
 * Test Strategy:
 * - Real PostgreSQL database with actual Drizzle repositories
 * - MSW for external MCE auth endpoints (token, userinfo)
 * - Zero vi.mock() on internal services
 * - Assert on observable behavior: DB state, return values
 *
 * Requires a running PostgreSQL instance (see vitest-integration.config.ts).
 */
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import {
  credentials,
  DrizzleCredentialsRepository,
  DrizzleTenantRepository,
  DrizzleUserRepository,
  tenants,
  users,
} from "@qpp/database";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import * as jose from "jose";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { Sql } from "postgres";
import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { ErrorCode } from "../common/errors";
import { createDbProxy } from "../database/db-proxy";
import { RlsContextService } from "../database/rls-context.service";
import { EncryptionService } from "../encryption";
import { assertDefined, getContextDb } from "../testing";
import { AuthService } from "./auth.service";
import { SeatLimitService } from "./seat-limit.service";

// Test constants with unique prefixes to avoid conflicts with other test suites
const AUTH_TEST_EID = "auth-integ-eid-unique-001";
const AUTH_TEST_SF_USER_ID = "auth-integ-sf-user-001";
const AUTH_TEST_TSSD = "auth-test-tssd";
const AUTH_TEST_MID = "auth-integ-mid-123";

// Secondary test identifiers for multi-user scenarios
const AUTH_TEST_EID_2 = "auth-integ-eid-unique-002";
const AUTH_TEST_SF_USER_ID_2 = "auth-integ-sf-user-002";
const AUTH_TEST_MID_2 = "auth-integ-mid-456";

// Track MSW call counts
interface MswCallTracker {
  tokenCalls: number;
  userinfoCalls: number;
  lastTokenRequest?: { body: string; url: string };
  lastUserinfoRequest?: { url: string };
}

let mswTracker: MswCallTracker = {
  tokenCalls: 0,
  userinfoCalls: 0,
};

// Default MSW handlers
const defaultTokenHandler = http.post(
  `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
  async ({ request }) => {
    mswTracker.tokenCalls++;
    mswTracker.lastTokenRequest = {
      body: await request.text(),
      url: request.url,
    };

    return HttpResponse.json({
      access_token: "mce-access-token-from-msw",
      refresh_token: "mce-refresh-token-from-msw",
      expires_in: 3600,
      rest_instance_url: `https://${AUTH_TEST_TSSD}.rest.marketingcloudapis.com`,
      soap_instance_url: `https://${AUTH_TEST_TSSD}.soap.marketingcloudapis.com`,
      scope: "email openid",
      token_type: "Bearer",
    });
  },
);

const defaultUserinfoHandler = http.get(
  `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
  async ({ request }) => {
    mswTracker.userinfoCalls++;
    mswTracker.lastUserinfoRequest = { url: request.url };

    return HttpResponse.json({
      sub: AUTH_TEST_SF_USER_ID,
      enterprise_id: AUTH_TEST_EID,
      member_id: AUTH_TEST_MID,
      email: "test@example.com",
      name: "Test User",
    });
  },
);

const server = setupServer(defaultTokenHandler, defaultUserinfoHandler);

// Database connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL environment variable is required for integration tests",
  );
}

// Migrations connection for cleanup (qs_migrate user bypasses RLS)
const migrationsConnectionString = process.env.DATABASE_URL_MIGRATIONS;
if (!migrationsConnectionString) {
  throw new Error(
    "DATABASE_URL_MIGRATIONS environment variable is required for integration tests. " +
      "See .env.example for setup instructions.",
  );
}

/**
 * Helper to create a valid JWT for testing handleJwtLogin.
 * Uses the actual JWT secret from env to ensure verification passes.
 */
async function createTestJwt(
  claims: {
    user_id?: string;
    enterprise_id?: string;
    member_id?: string;
    stack?: string;
  } = {},
): Promise<string> {
  // Use the actual secret from environment (set by vitest-integration.setup.ts or .env)
  const jwtSecret = process.env.MCE_JWT_SIGNING_SECRET;
  if (!jwtSecret) {
    throw new Error("MCE_JWT_SIGNING_SECRET not set in environment");
  }

  const secret = new TextEncoder().encode(jwtSecret);

  const jwt = await new jose.SignJWT({
    user_id: claims.user_id ?? AUTH_TEST_SF_USER_ID,
    enterprise_id: claims.enterprise_id ?? AUTH_TEST_EID,
    member_id: claims.member_id ?? AUTH_TEST_MID,
    stack: claims.stack ?? AUTH_TEST_TSSD,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);

  return jwt;
}

describe("AuthService Integration", () => {
  let module: TestingModule;
  let authService: AuthService;
  let encryptionService: EncryptionService;
  let rlsContextService: RlsContextService;
  let sqlClient: Sql;
  let superuserClient: Sql;
  let db: PostgresJsDatabase;
  let dbProxy: PostgresJsDatabase;

  // Track created entity IDs for cleanup
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: "error" });

    // Create direct DB connection for setup/cleanup
    sqlClient = postgres(connectionString, { max: 5 });
    db = drizzle(sqlClient);

    // Create migrations connection for cleanup (qs_migrate bypasses RLS)
    superuserClient = postgres(migrationsConnectionString, { max: 1 });

    // Clean up any leftover test data from previous runs
    await superuserClient`DELETE FROM credentials WHERE mid LIKE 'auth-integ-%'`;
    await superuserClient`DELETE FROM users WHERE sf_user_id LIKE 'auth-integ-%'`;
    await superuserClient`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_delete`;
    await superuserClient`DELETE FROM tenants WHERE eid LIKE 'auth-integ-%'`;
    await superuserClient`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_delete`;

    // Create db proxy that uses context-aware db when available (mimics DatabaseModule)
    dbProxy = createDbProxy(db);

    // Build NestJS TestingModule with real services
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          // ConfigModule will read from process.env
        }),
      ],
      providers: [
        AuthService,
        SeatLimitService,
        EncryptionService,
        RlsContextService,
        {
          provide: "SQL_CLIENT",
          useValue: sqlClient,
        },
        {
          provide: "CREATE_DATABASE_FROM_CLIENT",
          useValue: (
            client: Sql,
          ): PostgresJsDatabase<Record<string, unknown>> =>
            drizzle(client) as unknown as PostgresJsDatabase<
              Record<string, unknown>
            >,
        },
        {
          provide: "TENANT_REPOSITORY",
          useFactory: () => new DrizzleTenantRepository(dbProxy),
        },
        {
          provide: "USER_REPOSITORY",
          useFactory: () => new DrizzleUserRepository(dbProxy),
        },
        {
          provide: "CREDENTIALS_REPOSITORY",
          useFactory: () => new DrizzleCredentialsRepository(dbProxy),
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    encryptionService = module.get<EncryptionService>(EncryptionService);
    rlsContextService = module.get<RlsContextService>(RlsContextService);
  });

  beforeEach(() => {
    // Reset MSW tracker
    mswTracker = {
      tokenCalls: 0,
      userinfoCalls: 0,
    };
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(async () => {
    // Clean up test data (qs_migrate user bypasses RLS)
    await superuserClient`DELETE FROM credentials WHERE mid LIKE 'auth-integ-%'`;
    await superuserClient`DELETE FROM users WHERE sf_user_id LIKE 'auth-integ-%'`;
    await superuserClient`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_delete`;
    await superuserClient`DELETE FROM tenants WHERE eid LIKE 'auth-integ-%'`;
    await superuserClient`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_delete`;

    // Close connections
    server.close();
    await module.close();
    await superuserClient.end();
    await sqlClient.end();
  });

  describe("handleJwtLogin", () => {
    it("should create new tenant and user when none exist", async () => {
      const jwt = await createTestJwt();

      const result = await authService.handleJwtLogin(jwt);

      // Verify return structure
      expect(result).toHaveProperty("user");
      expect(result).toHaveProperty("tenant");
      expect(result).toHaveProperty("mid");

      // Verify tenant was created with correct EID
      expect(result.tenant.eid).toBe(AUTH_TEST_EID);
      expect(result.tenant.tssd).toBe(AUTH_TEST_TSSD);
      createdTenantIds.push(result.tenant.id);

      // Verify user was created with correct sfUserId
      expect(result.user.sfUserId).toBe(AUTH_TEST_SF_USER_ID);
      expect(result.user.tenantId).toBe(result.tenant.id);
      createdUserIds.push(result.user.id);

      // Verify MID
      expect(result.mid).toBe(AUTH_TEST_MID);

      // Verify MSW token endpoint was called
      expect(mswTracker.tokenCalls).toBe(1);
      expect(mswTracker.lastTokenRequest?.body).toContain(
        "grant_type=client_credentials",
      );

      // Verify credentials exist in database via RLS context
      const credResult = await rlsContextService.runWithTenantContext(
        result.tenant.id,
        AUTH_TEST_MID,
        async () => {
          const contextDb = getContextDb();
          const [cred] = await contextDb
            .select()
            .from(credentials)
            .where(
              and(
                eq(credentials.userId, result.user.id),
                eq(credentials.tenantId, result.tenant.id),
                eq(credentials.mid, AUTH_TEST_MID),
              ),
            );
          return cred;
        },
      );

      expect(credResult).toBeDefined();
      expect(credResult?.accessToken).toBeDefined();
      expect(credResult?.refreshToken).toBeDefined();
    });

    it("should return existing user when tenant already exists", async () => {
      // First login to create tenant and user
      const jwt = await createTestJwt({
        user_id: AUTH_TEST_SF_USER_ID_2,
        enterprise_id: AUTH_TEST_EID_2,
        member_id: AUTH_TEST_MID_2,
        stack: AUTH_TEST_TSSD,
      });

      const firstResult = await authService.handleJwtLogin(jwt);
      createdTenantIds.push(firstResult.tenant.id);
      createdUserIds.push(firstResult.user.id);

      const firstUserId = firstResult.user.id;
      const firstTenantId = firstResult.tenant.id;

      // Reset MSW tracker
      mswTracker.tokenCalls = 0;

      // Second login with same identifiers
      const secondResult = await authService.handleJwtLogin(jwt);

      // Should return same user and tenant
      expect(secondResult.user.id).toBe(firstUserId);
      expect(secondResult.tenant.id).toBe(firstTenantId);

      // Token endpoint should be called (tokens are refreshed each login)
      expect(mswTracker.tokenCalls).toBe(1);
    });

    it("should store encrypted tokens in credentials table", async () => {
      const uniqueEid = "auth-integ-eid-encrypt-test";
      const uniqueSfUserId = "auth-integ-sf-encrypt-test";
      const uniqueMid = "auth-integ-mid-encrypt";

      const jwt = await createTestJwt({
        user_id: uniqueSfUserId,
        enterprise_id: uniqueEid,
        member_id: uniqueMid,
        stack: AUTH_TEST_TSSD,
      });

      const result = await authService.handleJwtLogin(jwt);
      createdTenantIds.push(result.tenant.id);
      createdUserIds.push(result.user.id);

      // Query credentials via RLS context
      const cred = await rlsContextService.runWithTenantContext(
        result.tenant.id,
        uniqueMid,
        async () => {
          const contextDb = getContextDb();
          const [c] = await contextDb
            .select()
            .from(credentials)
            .where(
              and(
                eq(credentials.userId, result.user.id),
                eq(credentials.mid, uniqueMid),
              ),
            );
          return c;
        },
      );

      // Verify tokens are NOT stored in plaintext
      expect(cred?.accessToken).not.toBe("mce-access-token-from-msw");
      expect(cred?.refreshToken).not.toBe("mce-refresh-token-from-msw");

      // Verify they are encrypted (contain non-plaintext data)
      expect(cred?.accessToken.length).toBeGreaterThan(0);
      expect(cred?.refreshToken.length).toBeGreaterThan(0);
    });
  });

  describe("handleCallback", () => {
    it("should complete full OAuth callback flow", async () => {
      const uniqueEid = "auth-integ-eid-callback-001";
      const uniqueSfUserId = "auth-integ-sf-callback-001";
      const uniqueMid = "auth-integ-mid-callback";

      // Set up MSW handlers for this specific test
      server.use(
        http.post(
          `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          async () => {
            mswTracker.tokenCalls++;
            return HttpResponse.json({
              access_token: "callback-access-token",
              refresh_token: "callback-refresh-token",
              expires_in: 3600,
              rest_instance_url: `https://${AUTH_TEST_TSSD}.rest.marketingcloudapis.com`,
              soap_instance_url: `https://${AUTH_TEST_TSSD}.soap.marketingcloudapis.com`,
              scope: "email openid",
              token_type: "Bearer",
            });
          },
        ),
        http.get(
          `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
          async () => {
            mswTracker.userinfoCalls++;
            return HttpResponse.json({
              sub: uniqueSfUserId,
              enterprise_id: uniqueEid,
              member_id: uniqueMid,
              email: "callback-test@example.com",
              name: "Callback Test User",
            });
          },
        ),
      );

      const result = await authService.handleCallback(
        AUTH_TEST_TSSD,
        "test-auth-code",
        undefined, // sfUserId - let it derive from userinfo
        undefined, // eid - let it derive from userinfo
        undefined, // email
        undefined, // name
        uniqueMid,
      );

      // Verify return structure
      expect(result).toHaveProperty("user");
      expect(result).toHaveProperty("tenant");
      expect(result).toHaveProperty("mid");

      // Verify tenant was created
      expect(result.tenant.eid).toBe(uniqueEid);
      expect(result.tenant.tssd).toBe(AUTH_TEST_TSSD);
      createdTenantIds.push(result.tenant.id);

      // Verify user was created
      expect(result.user.sfUserId).toBe(uniqueSfUserId);
      expect(result.user.email).toBe("callback-test@example.com");
      expect(result.user.name).toBe("Callback Test User");
      createdUserIds.push(result.user.id);

      // Verify MSW endpoints were called
      expect(mswTracker.tokenCalls).toBe(1);
      expect(mswTracker.userinfoCalls).toBe(1);

      // Verify credentials exist via RLS context
      const cred = await rlsContextService.runWithTenantContext(
        result.tenant.id,
        uniqueMid,
        async () => {
          const contextDb = getContextDb();
          const [c] = await contextDb
            .select()
            .from(credentials)
            .where(
              and(
                eq(credentials.userId, result.user.id),
                eq(credentials.mid, uniqueMid),
              ),
            );
          return c;
        },
      );

      expect(cred).toBeDefined();
    });

    it("should throw AUTH_IDENTITY_MISMATCH when sfUserId does not match userinfo", async () => {
      // Set up MSW userinfo to return different user ID
      server.use(
        http.get(
          `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
          async () => {
            return HttpResponse.json({
              sub: "userinfo-returned-user-id",
              enterprise_id: AUTH_TEST_EID,
              member_id: AUTH_TEST_MID,
            });
          },
        ),
      );

      // Call with mismatched sfUserId
      await expect(
        authService.handleCallback(
          AUTH_TEST_TSSD,
          "test-auth-code",
          "provided-different-user-id", // Mismatched!
          undefined,
          undefined,
          undefined,
          AUTH_TEST_MID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.AUTH_IDENTITY_MISMATCH,
      });
    });

    it("should throw AUTH_IDENTITY_MISMATCH when eid does not match userinfo", async () => {
      // Set up MSW userinfo to return different enterprise ID
      server.use(
        http.get(
          `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
          async () => {
            return HttpResponse.json({
              sub: AUTH_TEST_SF_USER_ID,
              enterprise_id: "userinfo-returned-eid",
              member_id: AUTH_TEST_MID,
            });
          },
        ),
      );

      // Call with mismatched eid
      await expect(
        authService.handleCallback(
          AUTH_TEST_TSSD,
          "test-auth-code",
          undefined,
          "provided-different-eid", // Mismatched!
          undefined,
          undefined,
          AUTH_TEST_MID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.AUTH_IDENTITY_MISMATCH,
      });
    });

    it("should throw AUTH_IDENTITY_MISMATCH when MID does not match userinfo", async () => {
      server.use(
        http.get(
          `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
          async () => {
            return HttpResponse.json({
              sub: AUTH_TEST_SF_USER_ID,
              enterprise_id: AUTH_TEST_EID,
              member_id: "userinfo-returned-mid",
            });
          },
        ),
      );

      await expect(
        authService.handleCallback(
          AUTH_TEST_TSSD,
          "test-auth-code",
          undefined,
          undefined,
          undefined,
          undefined,
          "different-provided-mid",
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.AUTH_IDENTITY_MISMATCH,
      });
    });
  });

  describe("refreshToken", () => {
    it("should return cached token when not expired", async () => {
      // Create tenant, user, and valid credentials
      const uniqueEid = "auth-integ-eid-refresh-cached";
      const uniqueSfUserId = "auth-integ-sf-refresh-cached";
      const uniqueMid = "auth-integ-mid-refresh-cached";

      // Create tenant
      const [tenant] = await db
        .insert(tenants)
        .values({ eid: uniqueEid, tssd: AUTH_TEST_TSSD })
        .returning();
      assertDefined(tenant, "Tenant insert failed");
      createdTenantIds.push(tenant.id);

      const [user] = await db
        .insert(users)
        .values({ sfUserId: uniqueSfUserId, tenantId: tenant.id })
        .returning();
      assertDefined(user, "User insert failed");
      createdUserIds.push(user.id);

      const encryptedAccessToken = encryptionService.encrypt(
        "cached-access-token",
      ) as string;
      const encryptedRefreshToken = encryptionService.encrypt(
        "cached-refresh-token",
      ) as string;

      // Create credentials with future expiry (valid token) using RLS context
      const futureExpiry = new Date(Date.now() + 3600 * 1000); // +1 hour

      await rlsContextService.runWithTenantContext(
        tenant.id,
        uniqueMid,
        async () => {
          const contextDb = getContextDb();
          await contextDb.insert(credentials).values({
            tenantId: tenant.id,
            userId: user.id,
            mid: uniqueMid,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt: futureExpiry,
          });
        },
      );

      // Reset MSW tracker
      mswTracker.tokenCalls = 0;

      // Call refreshToken within RLS context - should return cached
      const result = await rlsContextService.runWithTenantContext(
        tenant.id,
        uniqueMid,
        async () =>
          authService.refreshToken(
            tenant.id,
            user.id,
            uniqueMid,
            false, // forceRefresh = false
          ),
      );

      // Verify cached token returned (decrypted)
      expect(result.accessToken).toBe("cached-access-token");
      expect(result.tssd).toBe(AUTH_TEST_TSSD);

      // Verify MSW token endpoint was NOT called
      expect(mswTracker.tokenCalls).toBe(0);
    });

    it("should refresh token when expired", async () => {
      // Create tenant, user, and expired credentials
      const uniqueEid = "auth-integ-eid-refresh-expired";
      const uniqueSfUserId = "auth-integ-sf-refresh-expired";
      const uniqueMid = "auth-integ-mid-refresh-expired";

      // Create tenant
      const [tenant] = await db
        .insert(tenants)
        .values({ eid: uniqueEid, tssd: AUTH_TEST_TSSD })
        .returning();
      assertDefined(tenant, "Tenant insert failed");
      createdTenantIds.push(tenant.id);

      const [user] = await db
        .insert(users)
        .values({ sfUserId: uniqueSfUserId, tenantId: tenant.id })
        .returning();
      assertDefined(user, "User insert failed");
      createdUserIds.push(user.id);

      const encryptedAccessToken = encryptionService.encrypt(
        "old-access-token",
      ) as string;
      const encryptedRefreshToken = encryptionService.encrypt(
        "old-refresh-token",
      ) as string;

      // Create credentials with past expiry using RLS context
      const pastExpiry = new Date(Date.now() - 3600 * 1000); // -1 hour

      await rlsContextService.runWithTenantContext(
        tenant.id,
        uniqueMid,
        async () => {
          const contextDb = getContextDb();
          await contextDb.insert(credentials).values({
            tenantId: tenant.id,
            userId: user.id,
            mid: uniqueMid,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt: pastExpiry,
          });
        },
      );

      // Set up MSW handler for refresh
      server.use(
        http.post(
          `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          async ({ request }) => {
            mswTracker.tokenCalls++;
            mswTracker.lastTokenRequest = {
              body: await request.text(),
              url: request.url,
            };

            return HttpResponse.json({
              access_token: "refreshed-access-token",
              refresh_token: "refreshed-refresh-token",
              expires_in: 3600,
              rest_instance_url: `https://${AUTH_TEST_TSSD}.rest.marketingcloudapis.com`,
              soap_instance_url: `https://${AUTH_TEST_TSSD}.soap.marketingcloudapis.com`,
              scope: "email openid",
              token_type: "Bearer",
            });
          },
        ),
      );

      // Reset tracker
      mswTracker.tokenCalls = 0;

      // Call refreshToken within RLS context - should refresh from MCE
      const result = await rlsContextService.runWithTenantContext(
        tenant.id,
        uniqueMid,
        async () =>
          authService.refreshToken(tenant.id, user.id, uniqueMid, false),
      );

      // Verify new token returned
      expect(result.accessToken).toBe("refreshed-access-token");
      expect(result.tssd).toBe(AUTH_TEST_TSSD);

      // Verify MSW token endpoint was called with refresh_token grant
      expect(mswTracker.tokenCalls).toBe(1);
      expect(mswTracker.lastTokenRequest?.body).toContain(
        "grant_type=refresh_token",
      );
    });

    it("should throw MCE_AUTH_EXPIRED when refresh fails with invalid_grant", async () => {
      // Create tenant, user, and expired credentials
      const uniqueEid = "auth-integ-eid-refresh-fail";
      const uniqueSfUserId = "auth-integ-sf-refresh-fail";
      const uniqueMid = "auth-integ-mid-refresh-fail";

      // Create tenant
      const [tenant] = await db
        .insert(tenants)
        .values({ eid: uniqueEid, tssd: AUTH_TEST_TSSD })
        .returning();
      assertDefined(tenant, "Tenant insert failed");
      createdTenantIds.push(tenant.id);

      const [user] = await db
        .insert(users)
        .values({ sfUserId: uniqueSfUserId, tenantId: tenant.id })
        .returning();
      assertDefined(user, "User insert failed");
      createdUserIds.push(user.id);

      const encryptedAccessToken = encryptionService.encrypt(
        "revoked-access-token",
      ) as string;
      const encryptedRefreshToken = encryptionService.encrypt(
        "revoked-refresh-token",
      ) as string;

      // Create credentials with past expiry using RLS context
      const pastExpiry = new Date(Date.now() - 3600 * 1000);

      await rlsContextService.runWithTenantContext(
        tenant.id,
        uniqueMid,
        async () => {
          const contextDb = getContextDb();
          await contextDb.insert(credentials).values({
            tenantId: tenant.id,
            userId: user.id,
            mid: uniqueMid,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt: pastExpiry,
          });
        },
      );

      // Set up MSW handler to return invalid_grant error
      server.use(
        http.post(
          `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          async () => {
            return HttpResponse.json(
              { error: "invalid_grant", error_description: "Token revoked" },
              { status: 400 },
            );
          },
        ),
      );

      // Call refreshToken within RLS context - should throw MCE_AUTH_EXPIRED
      await expect(
        rlsContextService.runWithTenantContext(tenant.id, uniqueMid, async () =>
          authService.refreshToken(tenant.id, user.id, uniqueMid, false),
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.MCE_AUTH_EXPIRED,
      });
    });

    it("should throw MCE_CREDENTIALS_MISSING when no credentials exist", async () => {
      // Create tenant and user without credentials
      const uniqueEid = "auth-integ-eid-no-creds";
      const uniqueSfUserId = "auth-integ-sf-no-creds";
      const uniqueMid = "auth-integ-mid-no-creds";

      const [tenant] = await db
        .insert(tenants)
        .values({ eid: uniqueEid, tssd: AUTH_TEST_TSSD })
        .returning();
      assertDefined(tenant, "Tenant insert failed");
      createdTenantIds.push(tenant.id);

      const [user] = await db
        .insert(users)
        .values({ sfUserId: uniqueSfUserId, tenantId: tenant.id })
        .returning();
      assertDefined(user, "User insert failed");
      createdUserIds.push(user.id);

      // Call refreshToken within RLS context without any credentials
      await expect(
        rlsContextService.runWithTenantContext(tenant.id, uniqueMid, async () =>
          authService.refreshToken(tenant.id, user.id, uniqueMid, false),
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.MCE_CREDENTIALS_MISSING,
      });
    });

    it("should coalesce concurrent refresh requests into single MCE call", async () => {
      // Setup: user with expired credentials
      const uniqueEid = "auth-integ-eid-concurrency";
      const uniqueSfUserId = "auth-integ-sf-concurrency";
      const uniqueMid = "auth-integ-mid-concurrency";

      const [tenant] = await db
        .insert(tenants)
        .values({ eid: uniqueEid, tssd: AUTH_TEST_TSSD })
        .returning();
      assertDefined(tenant, "Tenant insert failed");
      createdTenantIds.push(tenant.id);

      const [user] = await db
        .insert(users)
        .values({ sfUserId: uniqueSfUserId, tenantId: tenant.id })
        .returning();
      assertDefined(user, "User insert failed");
      createdUserIds.push(user.id);

      const encryptedAccessToken = encryptionService.encrypt(
        "expired-access-token",
      ) as string;
      const encryptedRefreshToken = encryptionService.encrypt(
        "expired-refresh-token",
      ) as string;

      // Create credentials with past expiry
      const pastExpiry = new Date(Date.now() - 3600 * 1000);

      await rlsContextService.runWithTenantContext(
        tenant.id,
        uniqueMid,
        async () => {
          const contextDb = getContextDb();
          await contextDb.insert(credentials).values({
            tenantId: tenant.id,
            userId: user.id,
            mid: uniqueMid,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt: pastExpiry,
          });
        },
      );

      // Set up MSW handler that tracks call count
      server.use(
        http.post(
          `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          async () => {
            mswTracker.tokenCalls++;
            return HttpResponse.json({
              access_token: "coalesced-access-token",
              refresh_token: "coalesced-refresh-token",
              expires_in: 3600,
              rest_instance_url: `https://${AUTH_TEST_TSSD}.rest.marketingcloudapis.com`,
              soap_instance_url: `https://${AUTH_TEST_TSSD}.soap.marketingcloudapis.com`,
              scope: "email openid",
              token_type: "Bearer",
            });
          },
        ),
      );

      mswTracker.tokenCalls = 0;

      // Make 3 concurrent refresh calls within a single RLS context
      // This tests the coalescing behavior without the timing variability
      // of separate context setup sequences
      const results = await rlsContextService.runWithTenantContext(
        tenant.id,
        uniqueMid,
        async () => {
          const refreshPromises = [
            authService.refreshToken(tenant.id, user.id, uniqueMid, false),
            authService.refreshToken(tenant.id, user.id, uniqueMid, false),
            authService.refreshToken(tenant.id, user.id, uniqueMid, false),
          ];
          return Promise.all(refreshPromises);
        },
      );

      const [result1, result2, result3] = results;
      assertDefined(result1, "First refresh result");
      assertDefined(result2, "Second refresh result");
      assertDefined(result3, "Third refresh result");

      // Only 1 MCE API call despite 3 concurrent requests
      expect(mswTracker.tokenCalls).toBe(1);

      // All calls get same token
      expect(result1.accessToken).toBe("coalesced-access-token");
      expect(result2.accessToken).toBe("coalesced-access-token");
      expect(result3.accessToken).toBe("coalesced-access-token");
    });
  });

  describe("invalidateToken", () => {
    it("should set expiresAt to epoch when invalidating credentials", async () => {
      // Create tenant, user, and valid credentials
      const uniqueEid = "auth-integ-eid-invalidate";
      const uniqueSfUserId = "auth-integ-sf-invalidate";
      const uniqueMid = "auth-integ-mid-invalidate";

      const [tenant] = await db
        .insert(tenants)
        .values({ eid: uniqueEid, tssd: AUTH_TEST_TSSD })
        .returning();
      assertDefined(tenant, "Tenant insert failed");
      createdTenantIds.push(tenant.id);

      const [user] = await db
        .insert(users)
        .values({ sfUserId: uniqueSfUserId, tenantId: tenant.id })
        .returning();
      assertDefined(user, "User insert failed");
      createdUserIds.push(user.id);

      const encryptedAccessToken = encryptionService.encrypt(
        "to-invalidate-access-token",
      ) as string;
      const encryptedRefreshToken = encryptionService.encrypt(
        "to-invalidate-refresh-token",
      ) as string;

      // Create credentials with future expiry using RLS context
      const futureExpiry = new Date(Date.now() + 3600 * 1000);

      await rlsContextService.runWithTenantContext(
        tenant.id,
        uniqueMid,
        async () => {
          const contextDb = getContextDb();
          await contextDb.insert(credentials).values({
            tenantId: tenant.id,
            userId: user.id,
            mid: uniqueMid,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt: futureExpiry,
          });
        },
      );

      // Call invalidateToken within RLS context
      await rlsContextService.runWithTenantContext(
        tenant.id,
        uniqueMid,
        async () => authService.invalidateToken(tenant.id, user.id, uniqueMid),
      );

      // Query credentials directly via RLS context
      const cred = await rlsContextService.runWithTenantContext(
        tenant.id,
        uniqueMid,
        async () => {
          const contextDb = getContextDb();
          const [c] = await contextDb
            .select()
            .from(credentials)
            .where(
              and(
                eq(credentials.userId, user.id),
                eq(credentials.mid, uniqueMid),
              ),
            );
          return c;
        },
      );

      // Verify expiresAt is epoch
      expect(cred).toBeDefined();
      expect(cred?.expiresAt.getTime()).toBe(0);

      // Verify tokens are preserved (for audit)
      expect(cred?.accessToken).toBe(encryptedAccessToken);
      expect(cred?.refreshToken).toBe(encryptedRefreshToken);
    });

    it("should do nothing when credentials do not exist", async () => {
      // Create tenant and user without credentials
      const uniqueEid = "auth-integ-eid-invalidate-none";
      const uniqueSfUserId = "auth-integ-sf-invalidate-none";
      const uniqueMid = "auth-integ-mid-invalidate-none";

      const [tenant] = await db
        .insert(tenants)
        .values({ eid: uniqueEid, tssd: AUTH_TEST_TSSD })
        .returning();
      assertDefined(tenant, "Tenant insert failed");
      createdTenantIds.push(tenant.id);

      const [user] = await db
        .insert(users)
        .values({ sfUserId: uniqueSfUserId, tenantId: tenant.id })
        .returning();
      assertDefined(user, "User insert failed");
      createdUserIds.push(user.id);

      // Call invalidateToken within RLS context - should not throw
      await expect(
        rlsContextService.runWithTenantContext(tenant.id, uniqueMid, async () =>
          authService.invalidateToken(tenant.id, user.id, uniqueMid),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe("verifyMceJwt", () => {
    it("should extract identity claims from valid JWT", async () => {
      const jwt = await createTestJwt({
        user_id: "verify-user-123",
        enterprise_id: "verify-eid-456",
        member_id: "verify-mid-789",
        stack: "verify-tssd",
      });

      const result = await authService.verifyMceJwt(jwt);

      expect(result.sfUserId).toBe("verify-user-123");
      expect(result.eid).toBe("verify-eid-456");
      expect(result.mid).toBe("verify-mid-789");
      expect(result.tssd).toBe("verify-tssd");
    });

    it("should throw AUTH_UNAUTHORIZED for invalid JWT signature", async () => {
      // Create JWT with wrong secret
      const wrongSecret = new TextEncoder().encode(
        "wrong-secret-not-matching-env-value-here",
      );

      const invalidJwt = await new jose.SignJWT({
        user_id: "user-123",
        enterprise_id: "eid-456",
        member_id: "mid-789",
        stack: "tssd",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(wrongSecret);

      await expect(authService.verifyMceJwt(invalidJwt)).rejects.toMatchObject({
        code: ErrorCode.AUTH_UNAUTHORIZED,
      });
    });

    it("should throw MCE_AUTH_EXPIRED for JWT missing required claims", async () => {
      const jwtSecret = process.env.MCE_JWT_SIGNING_SECRET;
      if (!jwtSecret) {
        throw new Error("MCE_JWT_SIGNING_SECRET not set");
      }

      const secret = new TextEncoder().encode(jwtSecret);

      // Create JWT missing user_id
      const incompleteJwt = await new jose.SignJWT({
        enterprise_id: "eid-456",
        member_id: "mid-789",
        stack: "tssd",
        // Missing user_id
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(secret);

      await expect(
        authService.verifyMceJwt(incompleteJwt),
      ).rejects.toMatchObject({
        code: ErrorCode.MCE_AUTH_EXPIRED,
        context: { reason: "JWT missing required identity claims" },
      });
    });

    it("should extract TSSD from application_context.base_url when stack is missing", async () => {
      const jwtSecret = process.env.MCE_JWT_SIGNING_SECRET;
      if (!jwtSecret) {
        throw new Error("MCE_JWT_SIGNING_SECRET not set");
      }

      const secret = new TextEncoder().encode(jwtSecret);

      const jwt = await new jose.SignJWT({
        user_id: "user-123",
        enterprise_id: "eid-456",
        member_id: "mid-789",
        application_context: {
          base_url: "https://mc-abc123.rest.marketingcloudapis.com/some/path",
        },
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(secret);

      const result = await authService.verifyMceJwt(jwt);
      expect(result.tssd).toBe("mc-abc123");
    });
  });

  describe("getTokensViaClientCredentials", () => {
    it("should call MCE token endpoint with client_credentials grant", async () => {
      // Track the request body
      server.use(
        http.post(
          `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          async ({ request }) => {
            mswTracker.tokenCalls++;
            mswTracker.lastTokenRequest = {
              body: await request.text(),
              url: request.url,
            };

            return HttpResponse.json({
              access_token: "cc-access-token",
              refresh_token: "cc-refresh-token",
              expires_in: 3600,
              rest_instance_url: `https://${AUTH_TEST_TSSD}.rest.marketingcloudapis.com`,
              soap_instance_url: `https://${AUTH_TEST_TSSD}.soap.marketingcloudapis.com`,
              scope: "email openid",
              token_type: "Bearer",
            });
          },
        ),
      );

      mswTracker.tokenCalls = 0;

      const result = await authService.getTokensViaClientCredentials(
        AUTH_TEST_TSSD,
        "test-account-id",
      );

      expect(result.access_token).toBe("cc-access-token");
      expect(result.refresh_token).toBe("cc-refresh-token");
      expect(result.expires_in).toBe(3600);

      expect(mswTracker.tokenCalls).toBe(1);
      expect(mswTracker.lastTokenRequest?.body).toContain(
        "grant_type=client_credentials",
      );
      expect(mswTracker.lastTokenRequest?.body).toContain(
        "account_id=test-account-id",
      );
    });
  });

  describe("exchangeCodeForToken", () => {
    it("should exchange authorization code for tokens", async () => {
      server.use(
        http.post(
          `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          async ({ request }) => {
            mswTracker.tokenCalls++;
            mswTracker.lastTokenRequest = {
              body: await request.text(),
              url: request.url,
            };

            return HttpResponse.json({
              access_token: "exchange-access-token",
              refresh_token: "exchange-refresh-token",
              expires_in: 3600,
              rest_instance_url: `https://${AUTH_TEST_TSSD}.rest.marketingcloudapis.com`,
              soap_instance_url: `https://${AUTH_TEST_TSSD}.soap.marketingcloudapis.com`,
              scope: "email openid",
              token_type: "Bearer",
            });
          },
        ),
      );

      mswTracker.tokenCalls = 0;

      const result = await authService.exchangeCodeForToken(
        AUTH_TEST_TSSD,
        "test-auth-code-123",
      );

      expect(result.access_token).toBe("exchange-access-token");
      expect(mswTracker.tokenCalls).toBe(1);
      expect(mswTracker.lastTokenRequest?.body).toContain(
        "grant_type=authorization_code",
      );
      expect(mswTracker.lastTokenRequest?.body).toContain(
        "code=test-auth-code-123",
      );
    });

    it("should throw AUTH_UNAUTHORIZED when token exchange fails", async () => {
      server.use(
        http.post(
          `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          async () => {
            return HttpResponse.json(
              { error: "invalid_token", error_description: "Code expired" },
              { status: 400 },
            );
          },
        ),
      );

      await expect(
        authService.exchangeCodeForToken(AUTH_TEST_TSSD, "expired-code"),
      ).rejects.toMatchObject({
        code: ErrorCode.AUTH_UNAUTHORIZED,
      });
    });

    it("should try embedded code first and fall back to original on invalid_token", async () => {
      let callCount = 0;
      server.use(
        http.post(
          `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          async ({ request }) => {
            callCount++;
            const body = await request.text();

            if (body.includes("code=embedded-code")) {
              return HttpResponse.json(
                { error: "invalid_token" },
                { status: 400 },
              );
            }
            if (body.includes("code=original-code")) {
              return HttpResponse.json({
                access_token: "success-token",
                refresh_token: "success-refresh",
                expires_in: 3600,
                rest_instance_url: `https://${AUTH_TEST_TSSD}.rest.marketingcloudapis.com`,
                soap_instance_url: `https://${AUTH_TEST_TSSD}.soap.marketingcloudapis.com`,
              });
            }
            return HttpResponse.json(
              { error: "unknown_code" },
              { status: 400 },
            );
          },
        ),
      );

      const result = await authService.exchangeCodeForToken(
        AUTH_TEST_TSSD,
        "original-code",
        "embedded-code",
      );

      expect(result.access_token).toBe("success-token");
      expect(callCount).toBe(2);
    });
  });

  describe("getAuthUrl", () => {
    it("should generate correct authorization URL", () => {
      const url = authService.getAuthUrl(AUTH_TEST_TSSD, "test-state-123");

      expect(url).toContain(
        `https://${AUTH_TEST_TSSD}.auth.marketingcloudapis.com/v2/authorize`,
      );
      expect(url).toContain("response_type=code");
      expect(url).toContain("client_id=");
      expect(url).toContain("state=test-state-123");
      expect(url).toContain("redirect_uri=");
    });
  });
});
