import { eq } from "drizzle-orm";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { tenantFeatureOverrides, tenants } from "../schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL environment variable is required for database tests",
  );
}

const TEST_EID = "feature-flag-test-eid";

describe("Feature Flags Schema", () => {
  let db: PostgresJsDatabase;
  let client: postgres.Sql;
  let tenantId: string;

  beforeAll(async () => {
    client = postgres(connectionString);
    db = drizzle(client);
  });

  afterAll(async () => {
    if (tenantId) {
      await client`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await db
        .delete(tenantFeatureOverrides)
        .where(eq(tenantFeatureOverrides.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
    await client.end();
  });

  it("tenants table has expected columns after schema migration", async () => {
    const [created] = await db
      .insert(tenants)
      .values({
        eid: TEST_EID,
        tssd: "test-subdomain",
      })
      .returning();
    if (!created) {
      throw new Error("Insert failed");
    }
    tenantId = created.id;

    expect(created.id).toBeDefined();
    expect(created.eid).toBe(TEST_EID);
    expect(created.tssd).toBe("test-subdomain");
    expect(created.auditRetentionDays).toBe(365);
    expect(created.installedAt).toBeDefined();
  });

  it("tenant_feature_overrides table stores override with FK constraint", async () => {
    await client`SELECT set_config('app.tenant_id', ${tenantId}, false)`;

    const [override] = await db
      .insert(tenantFeatureOverrides)
      .values({
        tenantId,
        featureKey: "advancedAutocomplete",
        enabled: true,
      })
      .returning();
    if (!override) {
      throw new Error("Insert failed");
    }

    expect(override.id).toBeDefined();
    expect(override.tenantId).toBe(tenantId);
    expect(override.featureKey).toBe("advancedAutocomplete");
    expect(override.enabled).toBe(true);
    expect(override.createdAt).toBeDefined();
  });

  it("composite unique constraint prevents duplicate (tenant_id, feature_key) pairs", async () => {
    await client`SELECT set_config('app.tenant_id', ${tenantId}, false)`;

    await db.insert(tenantFeatureOverrides).values({
      tenantId,
      featureKey: "minimap",
      enabled: true,
    });

    await expect(
      db.insert(tenantFeatureOverrides).values({
        tenantId,
        featureKey: "minimap",
        enabled: false,
      }),
    ).rejects.toThrow();
  });
});
