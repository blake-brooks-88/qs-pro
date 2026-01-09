import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { tenants, users, credentials } from "../schema";
import {
  DrizzleTenantRepository,
  DrizzleUserRepository,
  DrizzleCredentialsRepository,
} from "../repositories/drizzle-repositories";
import { eq } from "drizzle-orm";

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
