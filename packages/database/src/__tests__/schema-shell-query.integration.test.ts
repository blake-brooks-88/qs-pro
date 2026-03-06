import { eq, sql } from "drizzle-orm";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { shellQueryRuns, tenants, tenantSettings, users } from "../schema";

// DATABASE_URL is loaded from root .env via vitest.setup.ts
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL environment variable is required for database tests",
  );
}

describe("Shell Query Engine Schema", () => {
  let db: PostgresJsDatabase;
  let client: postgres.Sql;
  let tenantId: string;
  let userId: string;
  const mid = "123456";

  async function withRlsContext<T>(
    fn: (txDb: PostgresJsDatabase) => Promise<T>,
  ): Promise<Awaited<T>> {
    const result = await db.transaction(async (txDb) => {
      await txDb.execute(
        sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`,
      );
      await txDb.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
      await txDb.execute(sql`SELECT set_config('app.mid', ${mid}, true)`);
      return fn(txDb as unknown as PostgresJsDatabase);
    });
    return result;
  }

  beforeAll(async () => {
    client = postgres(connectionString, { max: 1 });
    db = drizzle(client);

    const uniqueId = randomUUID();

    // Setup: Create a tenant and user
    const [tenant] = await db
      .insert(tenants)
      .values({
        eid: `sqe-test-eid-${uniqueId}`,
        tssd: `sqe-test-subdomain-${uniqueId}`,
      })
      .returning();
    if (!tenant) {
      throw new Error("Insert failed");
    }
    tenantId = tenant.id;

    const [user] = await db
      .insert(users)
      .values({
        sfUserId: `sqe-test-user-${uniqueId}`,
        tenantId: tenant.id,
        email: "sqe@test.com",
        name: "SQE Tester",
      })
      .returning();
    if (!user) {
      throw new Error("Insert failed");
    }
    userId = user.id;
  });

  afterAll(async () => {
    if (tenantId && userId) {
      // Cleanup (need RLS context for shell_query_runs)
      await withRlsContext((txDb) =>
        txDb.delete(shellQueryRuns).where(eq(shellQueryRuns.tenantId, tenantId)),
      );
      await db
        .delete(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId));
      await db.delete(users).where(eq(users.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
    await client.end();
  });

  it("should insert a shell query run with required fields", async () => {
    const runData = {
      tenantId,
      userId,
      mid,
      sqlTextHash: "hash_of_select_star",
      status: "queued" as const,
    };

    const [run] = await withRlsContext((txDb) =>
      txDb.insert(shellQueryRuns).values(runData).returning(),
    );
    if (!run) {
      throw new Error("Insert failed");
    }

    expect(run.id).toBeDefined();
    expect(run.status).toBe("queued");
    expect(run.createdAt).toBeDefined();
    expect(run.mid).toBe(mid);
  });

  it("should update shell query run status and timestamps", async () => {
    const [run] = await withRlsContext((txDb) =>
      txDb
        .insert(shellQueryRuns)
        .values({
          tenantId,
          userId,
          mid,
          sqlTextHash: "hash_for_update",
          status: "queued",
        })
        .returning(),
    );
    if (!run) {
      throw new Error("Insert failed");
    }

    const [updated] = await withRlsContext((txDb) =>
      txDb
        .update(shellQueryRuns)
        .set({
          status: "running",
          startedAt: new Date(),
        })
        .where(eq(shellQueryRuns.id, run.id))
        .returning(),
    );
    if (!updated) {
      throw new Error("Update failed");
    }

    expect(updated.status).toBe("running");
    expect(updated.startedAt).toBeDefined();
  });

  it("should persist queryDefinitionId and pollStartedAt", async () => {
    const [run] = await withRlsContext((txDb) =>
      txDb
        .insert(shellQueryRuns)
        .values({
          tenantId,
          userId,
          mid,
          sqlTextHash: "hash_for_query_definition",
          status: "queued",
        })
        .returning(),
    );
    if (!run) {
      throw new Error("Insert failed");
    }

    const pollStartedAt = new Date();
    const queryDefinitionId = "test-query-definition-object-id";

    const [updated] = await withRlsContext((txDb) =>
      txDb
        .update(shellQueryRuns)
        .set({
          queryDefinitionId,
          pollStartedAt,
        })
        .where(eq(shellQueryRuns.id, run.id))
        .returning(),
    );
    if (!updated) {
      throw new Error("Update failed");
    }

    expect(updated.queryDefinitionId).toBe(queryDefinitionId);
    expect(updated.pollStartedAt).toBeInstanceOf(Date);
    if (updated.pollStartedAt === null) {
      throw new Error("pollStartedAt should not be null");
    }
    expect(
      Math.abs(updated.pollStartedAt.getTime() - pollStartedAt.getTime()),
    ).toBeLessThan(1000);
  });

  it("should upsert tenant settings with qppFolderId", async () => {
    const mid = "123456";
    const folderId = 987654321;

    const [created] = await withRlsContext((txDb) =>
      txDb
        .insert(tenantSettings)
        .values({
          tenantId,
          mid,
          qppFolderId: folderId,
        })
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.mid],
          set: { qppFolderId: folderId, updatedAt: new Date() },
        })
        .returning(),
    );
    if (!created) {
      throw new Error("Upsert failed");
    }

    expect(created.qppFolderId).toBe(folderId);
    expect(created.mid).toBe(mid);

    const newFolderId = 111111;
    const [updated] = await withRlsContext((txDb) =>
      txDb
        .insert(tenantSettings)
        .values({
          tenantId,
          mid,
          qppFolderId: newFolderId,
        })
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.mid],
          set: { qppFolderId: newFolderId, updatedAt: new Date() },
        })
        .returning(),
    );
    if (!updated) {
      throw new Error("Upsert failed");
    }

    expect(updated.id).toBe(created.id);
    expect(updated.qppFolderId).toBe(newFolderId);
  });
});
