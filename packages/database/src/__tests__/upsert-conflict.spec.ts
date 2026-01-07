import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { tenants, users, credentials } from "../schema";
import {
  DrizzleTenantRepository,
  DrizzleUserRepository,
} from "../repositories/drizzle-repositories";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:password@localhost:5432/qs_pro";

describe("Upsert Conflict Behavior", () => {
  let db: PostgresJsDatabase;
  let client: postgres.Sql;
  let tenantRepo: DrizzleTenantRepository;
  let userRepo: DrizzleUserRepository;

  beforeAll(async () => {
    client = postgres(connectionString);
    db = drizzle(client);
    tenantRepo = new DrizzleTenantRepository(db);
    userRepo = new DrizzleUserRepository(db);

    // Clean up
    await db.delete(credentials);
    await db.delete(users);
    await db.delete(tenants);
  });

  afterAll(async () => {
    await client.end();
  });

  it("Tenant: should update tssd on EID conflict", async () => {
    const eid = "test-eid-1";
    const initialTssd = "tssd-1";
    const updatedTssd = "tssd-updated";

    // First upsert
    await tenantRepo.upsert({ eid, tssd: initialTssd });
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
    const tenant = await tenantRepo.upsert({ eid: "tenant-2", tssd: "tssd-2" });
    const tenant2 = await tenantRepo.upsert({
      eid: "tenant-3",
      tssd: "tssd-3",
    });

    const sfUserId = "sf-user-1";
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
    await userRepo.upsert(initialData);
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
