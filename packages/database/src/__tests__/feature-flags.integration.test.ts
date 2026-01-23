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

  it("tenant subscription_tier column accepts valid enum values", async () => {
    const [freeTenant] = await db
      .insert(tenants)
      .values({
        eid: TEST_EID,
        tssd: "test-subdomain",
        subscriptionTier: "free",
      })
      .returning();
    if (!freeTenant) {
      throw new Error("Insert failed");
    }
    tenantId = freeTenant.id;

    expect(freeTenant.subscriptionTier).toBe("free");

    const [updated] = await db
      .update(tenants)
      .set({ subscriptionTier: "pro" })
      .where(eq(tenants.id, tenantId))
      .returning();
    if (!updated) {
      throw new Error("Update failed");
    }

    expect(updated.subscriptionTier).toBe("pro");

    const [enterprise] = await db
      .update(tenants)
      .set({ subscriptionTier: "enterprise" })
      .where(eq(tenants.id, tenantId))
      .returning();
    if (!enterprise) {
      throw new Error("Update failed");
    }

    expect(enterprise.subscriptionTier).toBe("enterprise");
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

  it("seat_limit nullable column works (null = unlimited)", async () => {
    const [withLimit] = await db
      .update(tenants)
      .set({ seatLimit: 10 })
      .where(eq(tenants.id, tenantId))
      .returning();
    if (!withLimit) {
      throw new Error("Update failed");
    }

    expect(withLimit.seatLimit).toBe(10);

    const [unlimited] = await db
      .update(tenants)
      .set({ seatLimit: null })
      .where(eq(tenants.id, tenantId))
      .returning();
    if (!unlimited) {
      throw new Error("Update failed");
    }

    expect(unlimited.seatLimit).toBeNull();
  });
});
