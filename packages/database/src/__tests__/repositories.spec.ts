import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { tenants, users, credentials } from "../schema";
import {
  DrizzleTenantRepository,
  DrizzleUserRepository,
  DrizzleCredentialsRepository,
} from "../repositories/drizzle-repositories";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:password@localhost:5432/qs_pro";

describe("Drizzle Repositories", () => {
  let db: PostgresJsDatabase;
  let client: postgres.Sql;
  let tenantRepo: DrizzleTenantRepository;
  let userRepo: DrizzleUserRepository;
  let credRepo: DrizzleCredentialsRepository;

  beforeAll(async () => {
    client = postgres(connectionString);
    db = drizzle(client);
    tenantRepo = new DrizzleTenantRepository(db);
    userRepo = new DrizzleUserRepository(db);
    credRepo = new DrizzleCredentialsRepository(db);

    // Clean up
    await db.delete(credentials);
    await db.delete(users);
    await db.delete(tenants);
  });

  afterAll(async () => {
    await client.end();
  });

  it("should upsert and find a tenant by eid", async () => {
    const tenantData = { eid: "12345", tssd: "mc-stack-1" };
    const savedTenant = await tenantRepo.upsert(tenantData);

    expect(savedTenant.eid).toBe(tenantData.eid);
    expect(savedTenant.tssd).toBe(tenantData.tssd);

    const foundTenant = await tenantRepo.findByEid(tenantData.eid);
    expect(foundTenant?.id).toBe(savedTenant.id);
  });

  it("should upsert and find a user by sfUserId", async () => {
    const [tenant] = await db.select().from(tenants).limit(1);
    const userData = {
      sfUserId: "user-789",
      tenantId: tenant.id,
      email: "test@example.com",
      name: "Test User",
    };

    const savedUser = await userRepo.upsert(userData);
    expect(savedUser.sfUserId).toBe(userData.sfUserId);

    const foundUser = await userRepo.findBySfUserId(userData.sfUserId);
    expect(foundUser?.id).toBe(savedUser.id);
  });

  it("should upsert and find credentials", async () => {
    const [tenant] = await db.select().from(tenants).limit(1);
    const [user] = await db.select().from(users).limit(1);

    const credData = {
      tenantId: tenant.id,
      userId: user.id,
      mid: "mid-123",
      accessToken: "access-123",
      refreshToken: "refresh-encrypted",
      expiresAt: new Date(Date.now() + 3600000),
    };

    const savedCred = await credRepo.upsert(credData);
    expect(savedCred.accessToken).toBe(credData.accessToken);

    const foundCred = await credRepo.findByUserTenantMid(
      user.id,
      tenant.id,
      "mid-123",
    );
    expect(foundCred?.id).toBe(savedCred.id);
  });
});
