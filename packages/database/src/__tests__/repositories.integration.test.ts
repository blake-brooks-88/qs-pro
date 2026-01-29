import { eq } from "drizzle-orm";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DrizzleCredentialsRepository,
  DrizzleTenantRepository,
  DrizzleUserRepository,
} from "../repositories/drizzle-repositories";
import { credentials, tenantFeatureOverrides, tenants, users } from "../schema";

// DATABASE_URL is loaded from root .env via vitest.setup.ts
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL environment variable is required for database tests",
  );
}

// Use unique test identifiers to avoid conflicts with other test suites
const TEST_EID = "repo-test-eid-12345";
const TEST_SF_USER_ID = "repo-test-user-789";

describe("Drizzle Repositories", () => {
  let db: PostgresJsDatabase;
  let client: postgres.Sql;
  let tenantRepo: DrizzleTenantRepository;
  let userRepo: DrizzleUserRepository;
  let credRepo: DrizzleCredentialsRepository;
  let testTenantId: string;
  let testUserId: string;

  beforeAll(async () => {
    client = postgres(connectionString);
    db = drizzle(client);
    tenantRepo = new DrizzleTenantRepository(db);
    userRepo = new DrizzleUserRepository(db);
    credRepo = new DrizzleCredentialsRepository(db);
  });

  afterAll(async () => {
    // Clean up only our test data (in correct FK order)
    if (testUserId) {
      await db.delete(credentials).where(eq(credentials.userId, testUserId));
    }
    if (testTenantId) {
      await db.delete(users).where(eq(users.tenantId, testTenantId));
      await db.delete(tenants).where(eq(tenants.id, testTenantId));
    }
    await client.end();
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
    const mid = "mid-123";
    const credData = {
      tenantId: testTenantId,
      userId: testUserId,
      mid,
      accessToken: "access-123",
      refreshToken: "refresh-encrypted",
      expiresAt: new Date(Date.now() + 3600000),
    };

    // Set RLS context for tenant/BU isolation (required by RLS policies)
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

// Unique identifiers for RLS isolation tests
const RLS_TEST_EID_1 = "rls-test-tenant-1-eid";
const RLS_TEST_EID_2 = "rls-test-tenant-2-eid";
const RLS_TEST_SF_USER_1 = "rls-test-user-1";
const RLS_TEST_SF_USER_2 = "rls-test-user-2";
const RLS_TEST_MID_1 = "rls-mid-111";
const RLS_TEST_MID_2 = "rls-mid-222";

describe("RLS Tenant Isolation", () => {
  let db: PostgresJsDatabase;
  let client: postgres.Sql;
  let credRepo: DrizzleCredentialsRepository;

  // Test data references
  let tenant1Id: string;
  let tenant2Id: string;
  let user1Id: string;
  let user2Id: string;

  // Helper to set RLS context
  async function setRlsContext(tenantId: string, mid: string): Promise<void> {
    await client`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
    await client`SELECT set_config('app.mid', ${mid}, false)`;
  }

  // Helper to reset RLS context
  async function resetRlsContext(): Promise<void> {
    await client`RESET app.tenant_id`;
    await client`RESET app.mid`;
  }

  beforeAll(async () => {
    client = postgres(connectionString);
    db = drizzle(client);
    credRepo = new DrizzleCredentialsRepository(db);

    // Create two tenants (upsert to handle leftover data from failed runs)
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

    // Create users for each tenant (upsert to handle leftover data from failed runs)
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

    // Create credentials for tenant1/user1 (requires RLS context)
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

    // Create credentials for tenant2/user2 (requires RLS context)
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

    // Create feature overrides for both tenants (upsert to handle leftover data)
    await setRlsContext(tenant1Id, RLS_TEST_MID_1);
    await db
      .insert(tenantFeatureOverrides)
      .values({
        tenantId: tenant1Id,
        featureKey: "rls-test-feature-1",
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
        featureKey: "rls-test-feature-2",
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
    // Cleanup in FK order: credentials → feature_overrides → users → tenants
    // Delete by tenantId to catch all data including leftovers from failed runs
    if (tenant1Id) {
      await setRlsContext(tenant1Id, RLS_TEST_MID_1);
      await db.delete(credentials).where(eq(credentials.tenantId, tenant1Id));
      await db
        .delete(tenantFeatureOverrides)
        .where(eq(tenantFeatureOverrides.tenantId, tenant1Id));
      await resetRlsContext();

      await db.delete(users).where(eq(users.tenantId, tenant1Id));
      await db.delete(tenants).where(eq(tenants.id, tenant1Id));
    }

    if (tenant2Id) {
      await setRlsContext(tenant2Id, RLS_TEST_MID_2);
      await db.delete(credentials).where(eq(credentials.tenantId, tenant2Id));
      await db
        .delete(tenantFeatureOverrides)
        .where(eq(tenantFeatureOverrides.tenantId, tenant2Id));
      await resetRlsContext();

      await db.delete(users).where(eq(users.tenantId, tenant2Id));
      await db.delete(tenants).where(eq(tenants.id, tenant2Id));
    }

    await client.end();
  });

  it("should enforce tenant isolation via RLS for credentials", async () => {
    // Set RLS context to tenant1
    await setRlsContext(tenant1Id, RLS_TEST_MID_1);

    // Query credentials using raw SQL to test RLS (bypasses repository WHERE clauses)
    const results = await client`SELECT * FROM credentials`;

    // Should only see tenant1's credentials due to RLS
    expect(results).toHaveLength(1);
    const row = results[0] as { tenant_id: string; access_token: string };
    expect(row.tenant_id).toBe(tenant1Id);
    expect(row.access_token).toBe("tenant1-access-token");

    await resetRlsContext();
  });

  it("should prevent cross-tenant data access for credentials", async () => {
    // Set RLS context to tenant1
    await setRlsContext(tenant1Id, RLS_TEST_MID_1);

    // Try to find tenant2's credentials using the repository
    const result = await credRepo.findByUserTenantMid(
      user2Id,
      tenant2Id,
      RLS_TEST_MID_2,
    );

    // Should return undefined due to RLS blocking access
    expect(result).toBeUndefined();

    await resetRlsContext();
  });

  it("should prevent inserting credentials with mismatched tenant context", async () => {
    // Set RLS context to tenant1
    await setRlsContext(tenant1Id, RLS_TEST_MID_1);

    // Attempt to insert credentials for tenant2 while tenant1 context is set
    // This should fail because RLS WITH CHECK blocks it
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
    // Set RLS context to tenant1
    await setRlsContext(tenant1Id, RLS_TEST_MID_1);

    // Query feature overrides using raw SQL to test RLS
    const results = await client`SELECT * FROM tenant_feature_overrides`;

    // Should only see tenant1's feature overrides due to RLS
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
    // Set RLS context to tenant1 but with tenant2's MID
    await setRlsContext(tenant1Id, RLS_TEST_MID_2);

    // Query credentials - should be empty because MID doesn't match
    const credResults = await client`SELECT * FROM credentials`;
    expect(credResults).toHaveLength(0);

    await resetRlsContext();
  });

  it("should allow querying own tenant data after context switch", async () => {
    // First verify tenant1's data
    await setRlsContext(tenant1Id, RLS_TEST_MID_1);
    const tenant1Creds = await client`SELECT * FROM credentials`;
    expect(tenant1Creds).toHaveLength(1);
    const row1 = tenant1Creds[0] as { access_token: string };
    expect(row1.access_token).toBe("tenant1-access-token");
    await resetRlsContext();

    // Now switch to tenant2 and verify its data
    await setRlsContext(tenant2Id, RLS_TEST_MID_2);
    const tenant2Creds = await client`SELECT * FROM credentials`;
    expect(tenant2Creds).toHaveLength(1);
    const row2 = tenant2Creds[0] as { access_token: string };
    expect(row2.access_token).toBe("tenant2-access-token");
    await resetRlsContext();
  });
});
