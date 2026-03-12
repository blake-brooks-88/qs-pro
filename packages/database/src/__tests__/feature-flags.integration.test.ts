import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
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

describe("Feature Flags Schema", () => {
  let db: PostgresJsDatabase;
  let client: postgres.Sql;
  let tenantId: string;
  const uniqueId = randomUUID();

  async function withRlsContext<T>(
    fn: (txDb: PostgresJsDatabase) => Promise<T>,
  ): Promise<Awaited<T>> {
    return db.transaction(async (txDb) => {
      await txDb.execute(
        sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`,
      );
      return fn(txDb as unknown as PostgresJsDatabase);
    });
  }

  beforeAll(async () => {
    client = postgres(connectionString, { max: 1 });
    db = drizzle(client);
  });

  afterAll(async () => {
    if (tenantId) {
      await withRlsContext(async (txDb) => {
        await txDb
          .delete(tenantFeatureOverrides)
          .where(eq(tenantFeatureOverrides.tenantId, tenantId));
      });
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
    await client.end();
  });

  it("tenants table has expected columns after schema migration", async () => {
    const [created] = await db
      .insert(tenants)
      .values({
        eid: `test---feature-flags-${uniqueId}`,
        tssd: `test---feature-flags-tssd-${uniqueId}`,
      })
      .returning();
    if (!created) {
      throw new Error("Insert failed");
    }
    tenantId = created.id;

    expect(created.id).toBeDefined();
    expect(created.eid).toBe(`test---feature-flags-${uniqueId}`);
    expect(created.tssd).toBe(`test---feature-flags-tssd-${uniqueId}`);
    expect(created.auditRetentionDays).toBe(365);
    expect(created.installedAt).toBeDefined();
  });

  it("tenant_feature_overrides table stores override with FK constraint", async () => {
    const [override] = await withRlsContext((txDb) =>
      txDb
        .insert(tenantFeatureOverrides)
        .values({
          tenantId,
          featureKey: "advancedAutocomplete",
          enabled: true,
        })
        .returning(),
    );
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
    await withRlsContext(async (txDb) => {
      await txDb.insert(tenantFeatureOverrides).values({
        tenantId,
        featureKey: "minimap",
        enabled: true,
      });
    });

    await expect(
      withRlsContext((txDb) =>
        txDb.insert(tenantFeatureOverrides).values({
          tenantId,
          featureKey: "minimap",
          enabled: false,
        }),
      ),
    ).rejects.toThrow();
  });
});
