import postgres from "postgres";

let seedSql: postgres.Sql | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getSeedSql(): postgres.Sql {
  if (seedSql) {
    return seedSql;
  }

  const url =
    process.env.DATABASE_URL_MIGRATIONS ??
    process.env.DATABASE_URL ??
    process.env.DATABASE_URL_BACKOFFICE;
  if (!url) {
    throw new Error(
      "Missing DATABASE_URL_MIGRATIONS/DATABASE_URL/DATABASE_URL_BACKOFFICE for integration tests",
    );
  }

  seedSql = postgres(url, { max: 1 });
  return seedSql;
}

export function makeTestEid(prefix: string): string {
  return `test---${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function createTenant(params?: {
  eid?: string;
  tssd?: string;
}): Promise<{ id: string; eid: string; tssd: string }> {
  const sql = getSeedSql();
  const eid = params?.eid ?? makeTestEid("backoffice-api");
  const tssd = params?.tssd ?? "test---tssd";

  const rows = await sql`
    INSERT INTO tenants (eid, tssd)
    VALUES (${eid}, ${tssd})
    RETURNING id, eid, tssd
  `;
  const row = rows[0] as { id: string; eid: string; tssd: string } | undefined;
  if (!row) {
    throw new Error("Failed to create test tenant");
  }
  return row;
}

export async function createUsersForTenant(
  tenantId: string,
  newUsers: Array<{ sfUserId: string; email?: string; name?: string }>,
): Promise<Array<{ id: string; sfUserId: string }>> {
  const sql = getSeedSql();

  if (newUsers.length === 0) {
    return [];
  }

  const valuesSql = newUsers.map((u) => [
    u.sfUserId,
    tenantId,
    u.email ?? null,
    u.name ?? null,
  ]) as unknown as postgres.EscapableArray[];

  const rows = await sql`
    INSERT INTO users (sf_user_id, tenant_id, email, name)
    VALUES ${sql(valuesSql)}
    RETURNING id, sf_user_id
  `;

  return (rows as unknown as Array<{ id: string; sf_user_id: string }>).map((r) => ({
    id: r.id,
    sfUserId: r.sf_user_id,
  }));
}

export async function cleanupBackofficeAuditLogsForUser(userId: string) {
  const sql = getSeedSql();
  await sql`DELETE FROM backoffice_audit_logs WHERE backoffice_user_id = ${userId}`;
}

function isTenantCleanupRace(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }

  const constraint = (err as { constraint?: unknown }).constraint;
  if (
    typeof constraint === "string" &&
    constraint === "backoffice_audit_logs_target_tenant_id_tenants_id_fk"
  ) {
    return true;
  }

  const message = (err as { message?: unknown }).message;
  if (
    typeof message === "string" &&
    message.includes("backoffice_audit_logs_target_tenant_id_tenants_id_fk")
  ) {
    return true;
  }

  return false;
}

export async function cleanupTenant(tenantId: string) {
  const sql = getSeedSql();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await sql.begin(async (tx) => {
        await tx`
          DELETE FROM backoffice_audit_logs
          WHERE target_tenant_id = ${tenantId}::uuid
        `;

        await tx`DELETE FROM query_publish_events WHERE tenant_id = ${tenantId}::uuid`;
        await tx`DELETE FROM query_versions WHERE tenant_id = ${tenantId}::uuid`;
        await tx`DELETE FROM saved_queries WHERE tenant_id = ${tenantId}::uuid`;
        await tx`DELETE FROM folders WHERE tenant_id = ${tenantId}::uuid`;
        await tx`DELETE FROM shell_query_runs WHERE tenant_id = ${tenantId}::uuid`;
        await tx`DELETE FROM snippets WHERE tenant_id = ${tenantId}::uuid`;
        await tx`DELETE FROM credentials WHERE tenant_id = ${tenantId}::uuid`;
        await tx`DELETE FROM tenant_settings WHERE tenant_id = ${tenantId}::uuid`;

        await tx`
          DELETE FROM tenant_feature_overrides
          WHERE tenant_id = ${tenantId}::uuid
        `;
        await tx`
          DELETE FROM stripe_checkout_sessions
          WHERE tenant_id = ${tenantId}::uuid
        `;
        await tx`
          DELETE FROM stripe_billing_bindings
          WHERE tenant_id = ${tenantId}::uuid
        `;
        await tx`
          DELETE FROM org_subscriptions
          WHERE tenant_id = ${tenantId}::uuid
        `;

        await tx`DELETE FROM users WHERE tenant_id = ${tenantId}::uuid`;

        await tx`
          DELETE FROM backoffice_audit_logs
          WHERE target_tenant_id = ${tenantId}::uuid
        `;

        await tx`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
      });
      return;
    } catch (err) {
      if (attempt >= 3 || !isTenantCleanupRace(err)) {
        throw err;
      }
      await sleep(50 * attempt);
    }
  }
}

export async function cleanupBoUser(userId: string) {
  const sql = getSeedSql();
  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM backoffice_audit_logs
      WHERE backoffice_user_id = ${userId}
    `;
    await tx`DELETE FROM bo_users WHERE id = ${userId}`;
  });
}
