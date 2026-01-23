import { inArray } from "drizzle-orm";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DrizzleTenantRepository,
  DrizzleUserRepository,
} from "../repositories/drizzle-repositories";
import { tenants, users } from "../schema";

// DATABASE_URL is loaded from root .env via vitest.setup.ts
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL environment variable is required for database tests",
  );
}

// Use unique test identifiers to avoid conflicts with other test suites
const TEST_EID_PREFIX = "upsert-conflict-test-";
const TEST_SF_USER_ID = "upsert-conflict-sf-user-1";

describe("Upsert Conflict Behavior", () => {
  let db: PostgresJsDatabase;
  let client: postgres.Sql;
  let tenantRepo: DrizzleTenantRepository;
  let userRepo: DrizzleUserRepository;
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    client = postgres(connectionString);
    db = drizzle(client);
    tenantRepo = new DrizzleTenantRepository(db);
    userRepo = new DrizzleUserRepository(db);
  });

  afterAll(async () => {
    // Clean up only our test data (in correct FK order)
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    await client.end();
  });

  it("Tenant: should update tssd on EID conflict", async () => {
    const eid = `${TEST_EID_PREFIX}eid-1`;
    const initialTssd = "tssd-1";
    const updatedTssd = "tssd-updated";

    // First upsert
    const firstTenant = await tenantRepo.upsert({ eid, tssd: initialTssd });
    createdTenantIds.push(firstTenant.id);
    const firstFetch = await tenantRepo.findByEid(eid);
    expect(firstFetch?.tssd).toBe(initialTssd);

    // Second upsert with same EID, different TSSD
    await tenantRepo.upsert({ eid, tssd: updatedTssd });
    const secondFetch = await tenantRepo.findByEid(eid);

    expect(secondFetch?.id).toBe(firstFetch?.id); // ID should remain the same
    expect(secondFetch?.tssd).toBe(updatedTssd); // TSSD should be updated
  });

  it("User: should update metadata and tenantId on SfUserId conflict", async () => {
    // Need a tenant first
    const tenant = await tenantRepo.upsert({
      eid: `${TEST_EID_PREFIX}tenant-2`,
      tssd: "tssd-2",
    });
    createdTenantIds.push(tenant.id);
    const tenant2 = await tenantRepo.upsert({
      eid: `${TEST_EID_PREFIX}tenant-3`,
      tssd: "tssd-3",
    });
    createdTenantIds.push(tenant2.id);

    const sfUserId = TEST_SF_USER_ID;
    const initialData = {
      sfUserId,
      tenantId: tenant.id,
      email: "initial@example.com",
      name: "Initial Name",
    };

    const updatedData = {
      sfUserId,
      tenantId: tenant2.id,
      email: "updated@example.com",
      name: "Updated Name",
    };

    // First upsert
    const firstUser = await userRepo.upsert(initialData);
    createdUserIds.push(firstUser.id);
    const firstFetch = await userRepo.findBySfUserId(sfUserId);
    expect(firstFetch?.email).toBe(initialData.email);
    expect(firstFetch?.tenantId).toBe(initialData.tenantId);

    // Second upsert with same sfUserId, different data
    await userRepo.upsert(updatedData);
    const secondFetch = await userRepo.findBySfUserId(sfUserId);

    expect(secondFetch?.id).toBe(firstFetch?.id); // ID should remain the same
    expect(secondFetch?.email).toBe(updatedData.email);
    expect(secondFetch?.name).toBe(updatedData.name);
    expect(secondFetch?.tenantId).toBe(updatedData.tenantId);
  });
});
