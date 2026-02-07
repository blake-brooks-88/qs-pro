import { eq, inArray, or } from "drizzle-orm";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DrizzleCredentialsRepository,
  DrizzleTenantRepository,
  DrizzleUserRepository,
} from "../repositories/drizzle-repositories";
import {
  credentials,
  shellQueryRuns,
  snippets,
  tenantFeatureOverrides,
  tenants,
  tenantSettings,
  users,
} from "../schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const migrationConnectionString = process.env.DATABASE_URL_MIGRATIONS;
if (!migrationConnectionString) {
  throw new Error("DATABASE_URL_MIGRATIONS environment variable is required");
}

const TEST_EID = "repo-test-eid-12345";
const TEST_SF_USER_ID = "repo-test-user-789";
const TEST_MID = "mid-123";

describe("Drizzle Repositories", () => {
  let db: PostgresJsDatabase;
  let client: postgres.Sql;
  let cleanupClient: postgres.Sql;
  let cleanupDb: PostgresJsDatabase;
  let tenantRepo: DrizzleTenantRepository;
  let userRepo: DrizzleUserRepository;
  let credRepo: DrizzleCredentialsRepository;
  let testTenantId: string;
  let testUserId: string;

  async function cleanupRepositoryTestData(): Promise<void> {
    const existingTenants = await cleanupDb
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.eid, TEST_EID));
    const tenantIds = existingTenants.map((t) => t.id);

    const existingUsers = await cleanupDb
      .select({ id: users.id })
      .from(users)
      .where(eq(users.sfUserId, TEST_SF_USER_ID));
    const userIds = existingUsers.map((u) => u.id);

    const credentialConditions = [eq(credentials.mid, TEST_MID)];
    if (tenantIds.length > 0) {
      credentialConditions.push(inArray(credentials.tenantId, tenantIds));
    }
    if (userIds.length > 0) {
      credentialConditions.push(inArray(credentials.userId, userIds));
    }
    await cleanupDb.delete(credentials).where(or(...credentialConditions));

    if (tenantIds.length > 0) {
      await cleanupDb
        .delete(snippets)
        .where(inArray(snippets.tenantId, tenantIds));
      await cleanupDb
        .delete(shellQueryRuns)
        .where(inArray(shellQueryRuns.tenantId, tenantIds));
      await cleanupDb
        .delete(tenantFeatureOverrides)
        .where(inArray(tenantFeatureOverrides.tenantId, tenantIds));
      await cleanupDb
        .delete(tenantSettings)
        .where(inArray(tenantSettings.tenantId, tenantIds));
      await cleanupDb.delete(users).where(inArray(users.tenantId, tenantIds));
      await cleanupDb.delete(tenants).where(inArray(tenants.id, tenantIds));
    }

    if (userIds.length > 0) {
      await cleanupDb.delete(snippets).where(inArray(snippets.userId, userIds));
      await cleanupDb
        .delete(shellQueryRuns)
        .where(inArray(shellQueryRuns.userId, userIds));
    }

    await cleanupDb.delete(users).where(eq(users.sfUserId, TEST_SF_USER_ID));
    await cleanupDb.delete(tenants).where(eq(tenants.eid, TEST_EID));
  }

  beforeAll(async () => {
    client = postgres(connectionString, { max: 1 });
    db = drizzle(client);
    tenantRepo = new DrizzleTenantRepository(db);
    userRepo = new DrizzleUserRepository(db);
    credRepo = new DrizzleCredentialsRepository(db);

    cleanupClient = postgres(migrationConnectionString, { max: 1 });
    cleanupDb = drizzle(cleanupClient);
    await cleanupRepositoryTestData();
  });

  afterAll(async () => {
    await cleanupRepositoryTestData();

    await client.end();
    await cleanupClient.end();
  });

  it("should upsert and find a tenant by eid", async () => {
    const tenantData = { eid: TEST_EID, tssd: "mc-stack-1" };
    const savedTenant = await tenantRepo.upsert(tenantData);
    testTenantId = savedTenant.id;

    expect(savedTenant.eid).toBe(tenantData.eid);
    expect(savedTenant.tssd).toBe(tenantData.tssd);

    const foundTenant = await tenantRepo.findByEid(tenantData.eid);
    expect(foundTenant?.id).toBe(savedTenant.id);
  });

  it("should upsert and find a user by sfUserId", async () => {
    const userData = {
      sfUserId: TEST_SF_USER_ID,
      tenantId: testTenantId,
      email: "test@example.com",
      name: "Test User",
    };

    const savedUser = await userRepo.upsert(userData);
    testUserId = savedUser.id;
    expect(savedUser.sfUserId).toBe(userData.sfUserId);

    const foundUser = await userRepo.findBySfUserId(userData.sfUserId);
    expect(foundUser?.id).toBe(savedUser.id);
  });

  it("should upsert and find credentials", async () => {
    const mid = TEST_MID;
    const credData = {
      tenantId: testTenantId,
      userId: testUserId,
      mid,
      accessToken: "access-123",
      refreshToken: "refresh-encrypted",
      expiresAt: new Date(Date.now() + 3600000),
    };

    await client`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
    await client`SELECT set_config('app.mid', ${mid}, false)`;

    const savedCred = await credRepo.upsert(credData);
    expect(savedCred.accessToken).toBe(credData.accessToken);

    const foundCred = await credRepo.findByUserTenantMid(
      testUserId,
      testTenantId,
      mid,
    );
    expect(foundCred?.id).toBe(savedCred.id);
  });
});

const RLS_TEST_EID_1 = "rls-test-tenant-1-eid";
const RLS_TEST_EID_2 = "rls-test-tenant-2-eid";
const RLS_TEST_SF_USER_1 = "rls-test-user-1";
const RLS_TEST_SF_USER_2 = "rls-test-user-2";
const RLS_TEST_MID_1 = "rls-mid-111";
const RLS_TEST_MID_2 = "rls-mid-222";
const RLS_TEST_FEATURE_KEY_1 = "rls-test-feature-1";
const RLS_TEST_FEATURE_KEY_2 = "rls-test-feature-2";
const RLS_TEST_EIDS = [RLS_TEST_EID_1, RLS_TEST_EID_2] as const;
const RLS_TEST_SF_USERS = [RLS_TEST_SF_USER_1, RLS_TEST_SF_USER_2] as const;
const RLS_TEST_MIDS = [RLS_TEST_MID_1, RLS_TEST_MID_2] as const;
const RLS_TEST_FEATURE_KEYS = [
  RLS_TEST_FEATURE_KEY_1,
  RLS_TEST_FEATURE_KEY_2,
] as const;

describe("RLS Tenant Isolation", () => {
  let db: PostgresJsDatabase;
  let client: postgres.Sql;
  let credRepo: DrizzleCredentialsRepository;

  let cleanupClient: postgres.Sql;
  let cleanupDb: PostgresJsDatabase;

  let tenant1Id: string;
  let tenant2Id: string;
  let user1Id: string;
  let user2Id: string;

  async function setRlsContext(tenantId: string, mid: string): Promise<void> {
    await client`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
    await client`SELECT set_config('app.mid', ${mid}, false)`;
  }

  async function resetRlsContext(): Promise<void> {
    await client`RESET app.tenant_id`;
    await client`RESET app.mid`;
  }

  async function cleanupRlsTestData(): Promise<void> {
    const existingTenants = await cleanupDb
      .select({ id: tenants.id })
      .from(tenants)
      .where(inArray(tenants.eid, [...RLS_TEST_EIDS]));
    const tenantIds = existingTenants.map((t) => t.id);

    const existingUsers = await cleanupDb
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.sfUserId, [...RLS_TEST_SF_USERS]));
    const userIds = existingUsers.map((u) => u.id);

    const credentialConditions = [inArray(credentials.mid, [...RLS_TEST_MIDS])];
    if (tenantIds.length > 0) {
      credentialConditions.push(inArray(credentials.tenantId, tenantIds));
    }
    if (userIds.length > 0) {
      credentialConditions.push(inArray(credentials.userId, userIds));
    }
    await cleanupDb.delete(credentials).where(or(...credentialConditions));

    const tenantFeatureConditions = [
      inArray(tenantFeatureOverrides.featureKey, [...RLS_TEST_FEATURE_KEYS]),
    ];
    if (tenantIds.length > 0) {
      tenantFeatureConditions.push(
        inArray(tenantFeatureOverrides.tenantId, tenantIds),
      );
    }
    await cleanupDb
      .delete(tenantFeatureOverrides)
      .where(or(...tenantFeatureConditions));

    const tenantSettingsConditions = [
      inArray(tenantSettings.mid, [...RLS_TEST_MIDS]),
    ];
    if (tenantIds.length > 0) {
      tenantSettingsConditions.push(
        inArray(tenantSettings.tenantId, tenantIds),
      );
    }
    await cleanupDb
      .delete(tenantSettings)
      .where(or(...tenantSettingsConditions));

    if (tenantIds.length > 0) {
      await cleanupDb
        .delete(snippets)
        .where(inArray(snippets.tenantId, tenantIds));
      await cleanupDb
        .delete(shellQueryRuns)
        .where(inArray(shellQueryRuns.tenantId, tenantIds));
    }

    if (userIds.length > 0) {
      await cleanupDb.delete(snippets).where(inArray(snippets.userId, userIds));
      await cleanupDb
        .delete(shellQueryRuns)
        .where(inArray(shellQueryRuns.userId, userIds));
    }

    await cleanupDb
      .delete(users)
      .where(inArray(users.sfUserId, [...RLS_TEST_SF_USERS]));
    await cleanupDb
      .delete(tenants)
      .where(inArray(tenants.eid, [...RLS_TEST_EIDS]));
  }

  beforeAll(async () => {
    client = postgres(connectionString, { max: 1 });
    db = drizzle(client);
    credRepo = new DrizzleCredentialsRepository(db);

    cleanupClient = postgres(migrationConnectionString, { max: 1 });
    cleanupDb = drizzle(cleanupClient);

    const bypass = await cleanupClient<
      Array<{ rolbypassrls: boolean | null }>
    >`SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    if (!bypass[0]?.rolbypassrls) {
      throw new Error(
        "DATABASE_URL_MIGRATIONS must use a role with BYPASSRLS for RLS integration tests",
      );
    }

    await cleanupRlsTestData();

    const [tenant1] = await db
      .insert(tenants)
      .values({ eid: RLS_TEST_EID_1, tssd: "rls-stack-1" })
      .onConflictDoUpdate({
        target: tenants.eid,
        set: { tssd: "rls-stack-1" },
      })
      .returning();
    if (!tenant1) {
      throw new Error("Tenant 1 insert failed");
    }
    tenant1Id = tenant1.id;

    const [tenant2] = await db
      .insert(tenants)
      .values({ eid: RLS_TEST_EID_2, tssd: "rls-stack-2" })
      .onConflictDoUpdate({
        target: tenants.eid,
        set: { tssd: "rls-stack-2" },
      })
      .returning();
    if (!tenant2) {
      throw new Error("Tenant 2 insert failed");
    }
    tenant2Id = tenant2.id;

    const [user1] = await db
      .insert(users)
      .values({
        sfUserId: RLS_TEST_SF_USER_1,
        tenantId: tenant1Id,
        email: "rls-user1@test.com",
        name: "RLS User 1",
      })
      .onConflictDoUpdate({
        target: users.sfUserId,
        set: { tenantId: tenant1Id, email: "rls-user1@test.com" },
      })
      .returning();
    if (!user1) {
      throw new Error("User 1 insert failed");
    }
    user1Id = user1.id;

    const [user2] = await db
      .insert(users)
      .values({
        sfUserId: RLS_TEST_SF_USER_2,
        tenantId: tenant2Id,
        email: "rls-user2@test.com",
        name: "RLS User 2",
      })
      .onConflictDoUpdate({
        target: users.sfUserId,
        set: { tenantId: tenant2Id, email: "rls-user2@test.com" },
      })
      .returning();
    if (!user2) {
      throw new Error("User 2 insert failed");
    }
    user2Id = user2.id;

    await setRlsContext(tenant1Id, RLS_TEST_MID_1);
    await credRepo.upsert({
      tenantId: tenant1Id,
      userId: user1Id,
      mid: RLS_TEST_MID_1,
      accessToken: "tenant1-access-token",
      refreshToken: "tenant1-refresh-token",
      expiresAt: new Date(Date.now() + 3600000),
    });
    await resetRlsContext();

    await setRlsContext(tenant2Id, RLS_TEST_MID_2);
    await credRepo.upsert({
      tenantId: tenant2Id,
      userId: user2Id,
      mid: RLS_TEST_MID_2,
      accessToken: "tenant2-access-token",
      refreshToken: "tenant2-refresh-token",
      expiresAt: new Date(Date.now() + 3600000),
    });
    await resetRlsContext();

    await setRlsContext(tenant1Id, RLS_TEST_MID_1);
    await db
      .insert(tenantFeatureOverrides)
      .values({
        tenantId: tenant1Id,
        featureKey: RLS_TEST_FEATURE_KEY_1,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: [
          tenantFeatureOverrides.tenantId,
          tenantFeatureOverrides.featureKey,
        ],
        set: { enabled: true },
      });
    await resetRlsContext();

    await setRlsContext(tenant2Id, RLS_TEST_MID_2);
    await db
      .insert(tenantFeatureOverrides)
      .values({
        tenantId: tenant2Id,
        featureKey: RLS_TEST_FEATURE_KEY_2,
        enabled: false,
      })
      .onConflictDoUpdate({
        target: [
          tenantFeatureOverrides.tenantId,
          tenantFeatureOverrides.featureKey,
        ],
        set: { enabled: false },
      });
    await resetRlsContext();
  });

  afterAll(async () => {
    await cleanupRlsTestData();

    await client.end();
    await cleanupClient.end();
  });

  it("should enforce tenant isolation via RLS for credentials", async () => {
    await setRlsContext(tenant1Id, RLS_TEST_MID_1);

    const results = await client`SELECT * FROM credentials`;

    expect(results).toHaveLength(1);
    const row = results[0] as { tenant_id: string; access_token: string };
    expect(row.tenant_id).toBe(tenant1Id);
    expect(row.access_token).toBe("tenant1-access-token");

    await resetRlsContext();
  });

  it("should prevent cross-tenant data access for credentials", async () => {
    await setRlsContext(tenant1Id, RLS_TEST_MID_1);

    const result = await credRepo.findByUserTenantMid(
      user2Id,
      tenant2Id,
      RLS_TEST_MID_2,
    );

    expect(result).toBeUndefined();

    await resetRlsContext();
  });

  it("should prevent inserting credentials with mismatched tenant context", async () => {
    await setRlsContext(tenant1Id, RLS_TEST_MID_1);

    await expect(
      credRepo.upsert({
        tenantId: tenant2Id,
        userId: user2Id,
        mid: RLS_TEST_MID_2,
        accessToken: "cross-tenant-attack-token",
        refreshToken: "cross-tenant-attack-refresh",
        expiresAt: new Date(Date.now() + 3600000),
      }),
    ).rejects.toThrow();

    await resetRlsContext();
  });

  it("should enforce tenant isolation for tenant_feature_overrides", async () => {
    await setRlsContext(tenant1Id, RLS_TEST_MID_1);

    const results = await client`SELECT * FROM tenant_feature_overrides`;

    expect(results).toHaveLength(1);
    const row = results[0] as {
      tenant_id: string;
      feature_key: string;
      enabled: boolean;
    };
    expect(row.tenant_id).toBe(tenant1Id);
    expect(row.feature_key).toBe("rls-test-feature-1");
    expect(row.enabled).toBe(true);

    await resetRlsContext();
  });

  it("should return empty results when querying with wrong tenant context", async () => {
    await setRlsContext(tenant1Id, RLS_TEST_MID_2);

    const credResults = await client`SELECT * FROM credentials`;
    expect(credResults).toHaveLength(0);

    await resetRlsContext();
  });

  it("should allow querying own tenant data after context switch", async () => {
    await setRlsContext(tenant1Id, RLS_TEST_MID_1);
    const tenant1Creds = await client`SELECT * FROM credentials`;
    expect(tenant1Creds).toHaveLength(1);
    const row1 = tenant1Creds[0] as { access_token: string };
    expect(row1.access_token).toBe("tenant1-access-token");
    await resetRlsContext();

    await setRlsContext(tenant2Id, RLS_TEST_MID_2);
    const tenant2Creds = await client`SELECT * FROM credentials`;
    expect(tenant2Creds).toHaveLength(1);
    const row2 = tenant2Creds[0] as { access_token: string };
    expect(row2.access_token).toBe("tenant2-access-token");
    await resetRlsContext();
  });
});
