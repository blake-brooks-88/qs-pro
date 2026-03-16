import type { Sql } from 'postgres';
import postgres from 'postgres';

import { getPrivilegedUrl } from './privileged-db-url';

/**
 * Seed / cleanup helpers for GDPR integration tests.
 *
 * Seed functions use the Nest app's SQL_CLIENT (with RLS context where needed).
 * Cleanup uses its own privileged connection (qs_migrate) to bypass RLS + triggers.
 */

// ─── Seed Functions ─────────────────────────────────────────────────

export async function createTestTenant(
  sql: Sql,
  suffix: string,
): Promise<{ tenantId: string; eid: string }> {
  const eid = `test---gdpr-${suffix}`;
  const [row] = await sql`
    INSERT INTO tenants (eid, tssd)
    VALUES (${eid}, ${'test---gdpr-tssd'})
    ON CONFLICT (eid) DO UPDATE SET tssd = ${'test---gdpr-tssd'}
    RETURNING id
  `;
  if (!row) {
    throw new Error('Failed to insert test tenant');
  }
  return { tenantId: row.id, eid };
}

export async function createTestUser(
  sql: Sql,
  tenantId: string,
  opts: {
    sfUserId: string;
    role?: 'owner' | 'admin' | 'member';
    email?: string;
    name?: string;
  },
): Promise<{ userId: string }> {
  const role = opts.role ?? 'member';
  const email = opts.email ?? `${opts.sfUserId}@test.gdpr`;
  const name = opts.name ?? `GDPR Test User (${opts.sfUserId})`;
  const [row] = await sql`
    INSERT INTO users (sf_user_id, tenant_id, email, name, role)
    VALUES (${opts.sfUserId}, ${tenantId}::uuid, ${email}, ${name}, ${role})
    ON CONFLICT (sf_user_id) DO UPDATE
      SET email = ${email}, name = ${name}, role = ${role}
    RETURNING id
  `;
  if (!row) {
    throw new Error('Failed to insert test user');
  }
  return { userId: row.id };
}

export async function createTestCredential(
  sql: Sql,
  tenantId: string,
  mid: string,
  userId: string,
): Promise<{ credentialId: string }> {
  const reserved = await sql.reserve();
  try {
    await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
    await reserved`SELECT set_config('app.mid', ${mid}, false)`;
    const [row] = await reserved`
      INSERT INTO credentials (tenant_id, user_id, mid, access_token, refresh_token, expires_at)
      VALUES (${tenantId}::uuid, ${userId}::uuid, ${mid}, 'test-access', 'test-refresh', NOW() + INTERVAL '1 hour')
      RETURNING id
    `;
    await reserved`RESET app.tenant_id`;
    await reserved`RESET app.mid`;
    if (!row) {
      throw new Error('Failed to insert test credential');
    }
    return { credentialId: row.id };
  } finally {
    reserved.release();
  }
}

export async function createTestFolder(
  sql: Sql,
  tenantId: string,
  mid: string,
  userId: string,
  opts?: {
    name?: string;
    visibility?: 'personal' | 'shared';
    parentId?: string;
  },
): Promise<{ folderId: string }> {
  const name = opts?.name ?? 'GDPR Test Folder';
  const visibility = opts?.visibility ?? 'personal';
  const parentId = opts?.parentId ?? null;
  const reserved = await sql.reserve();
  try {
    await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
    await reserved`SELECT set_config('app.mid', ${mid}, false)`;
    await reserved`SELECT set_config('app.user_id', ${userId}, false)`;
    const [row] = await reserved`
      INSERT INTO folders (tenant_id, mid, user_id, name, visibility, parent_id)
      VALUES (${tenantId}::uuid, ${mid}, ${userId}::uuid, ${name}, ${visibility}, ${parentId})
      RETURNING id
    `;
    await reserved`RESET app.tenant_id`;
    await reserved`RESET app.mid`;
    await reserved`RESET app.user_id`;
    if (!row) {
      throw new Error('Failed to insert test folder');
    }
    return { folderId: row.id };
  } finally {
    reserved.release();
  }
}

export async function createTestSavedQuery(
  sql: Sql,
  tenantId: string,
  mid: string,
  userId: string,
  encryptFn: (plaintext: string) => string,
  opts?: { name?: string; sqlText?: string; folderId?: string },
): Promise<{ savedQueryId: string }> {
  const name = opts?.name ?? 'GDPR Test Query';
  const plainSql = opts?.sqlText ?? 'SELECT SubscriberKey FROM _Subscribers';
  const encrypted = encryptFn(plainSql);
  const folderId = opts?.folderId ?? null;
  const reserved = await sql.reserve();
  try {
    await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
    await reserved`SELECT set_config('app.mid', ${mid}, false)`;
    await reserved`SELECT set_config('app.user_id', ${userId}, false)`;
    const [row] = await reserved`
      INSERT INTO saved_queries (tenant_id, mid, user_id, folder_id, name, sql_text_encrypted)
      VALUES (${tenantId}::uuid, ${mid}, ${userId}::uuid, ${folderId}, ${name}, ${encrypted})
      RETURNING id
    `;
    await reserved`RESET app.tenant_id`;
    await reserved`RESET app.mid`;
    await reserved`RESET app.user_id`;
    if (!row) {
      throw new Error('Failed to insert test saved query');
    }
    return { savedQueryId: row.id };
  } finally {
    reserved.release();
  }
}

export async function createTestSnippet(
  sql: Sql,
  tenantId: string,
  mid: string,
  userId: string,
  opts?: { title?: string; code?: string; isShared?: boolean },
): Promise<{ snippetId: string }> {
  const title = opts?.title ?? 'GDPR Test Snippet';
  const code = opts?.code ?? 'SELECT 1';
  const isShared = opts?.isShared ?? false;
  const row = await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx`SELECT set_config('app.mid', ${mid}, true)`;
    const [created] = await tx`
      INSERT INTO snippets (tenant_id, mid, scope, user_id, title, code, is_shared)
      VALUES (${tenantId}::uuid, ${mid}, 'bu', ${userId}::uuid, ${title}, ${code}, ${isShared})
      RETURNING id
    `;
    return created;
  });

  if (!row) {
    throw new Error('Failed to insert test snippet');
  }

  return { snippetId: row.id };
}

export async function createTestAuditLog(
  sql: Sql,
  tenantId: string,
  mid: string,
  actorId: string,
  opts?: { ipAddress?: string; userAgent?: string; eventType?: string },
): Promise<{ auditLogId: string }> {
  const ipAddress = opts?.ipAddress ?? '127.0.0.1';
  const userAgent = opts?.userAgent ?? 'test-agent';
  const eventType = opts?.eventType ?? 'gdpr.test_event';
  const reserved = await sql.reserve();
  try {
    await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
    await reserved`SELECT set_config('app.mid', ${mid}, false)`;
    const [row] = await reserved`
      INSERT INTO audit_logs (tenant_id, mid, event_type, actor_type, actor_id, ip_address, user_agent)
      VALUES (${tenantId}::uuid, ${mid}, ${eventType}, 'user', ${actorId}::uuid, ${ipAddress}, ${userAgent})
      RETURNING id
    `;
    await reserved`RESET app.tenant_id`;
    await reserved`RESET app.mid`;
    if (!row) {
      throw new Error('Failed to insert test audit log');
    }
    return { auditLogId: row.id };
  } finally {
    reserved.release();
  }
}

export async function createTestShellQueryRun(
  sql: Sql,
  tenantId: string,
  mid: string,
  userId: string,
  encryptFn: (plaintext: string) => string,
  opts?: { sqlText?: string },
): Promise<{ runId: string }> {
  const plainSql = opts?.sqlText ?? 'SELECT EmailAddress FROM _Subscribers';
  const encrypted = encryptFn(plainSql);
  const reserved = await sql.reserve();
  try {
    await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
    await reserved`SELECT set_config('app.mid', ${mid}, false)`;
    await reserved`SELECT set_config('app.user_id', ${userId}, false)`;
    const [row] = await reserved`
      INSERT INTO shell_query_runs (tenant_id, user_id, mid, sql_text_hash, sql_text_encrypted, status)
      VALUES (${tenantId}::uuid, ${userId}::uuid, ${mid}, 'test-hash', ${encrypted}, 'ready')
      RETURNING id
    `;
    await reserved`RESET app.tenant_id`;
    await reserved`RESET app.mid`;
    await reserved`RESET app.user_id`;
    if (!row) {
      throw new Error('Failed to insert test shell query run');
    }
    return { runId: row.id };
  } finally {
    reserved.release();
  }
}

export async function createTestOrgSubscription(
  sql: Sql,
  tenantId: string,
  opts?: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    tier?: 'free' | 'pro' | 'enterprise';
  },
): Promise<void> {
  const tier = opts?.tier ?? 'free';
  const stripeCustomerId = opts?.stripeCustomerId ?? null;
  const stripeSubscriptionId = opts?.stripeSubscriptionId ?? null;
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx`
      INSERT INTO org_subscriptions (tenant_id, tier, stripe_customer_id, stripe_subscription_id)
      VALUES (${tenantId}::uuid, ${tier}, ${stripeCustomerId}, ${stripeSubscriptionId})
      ON CONFLICT (tenant_id) DO UPDATE
        SET tier = ${tier},
            stripe_customer_id = ${stripeCustomerId},
            stripe_subscription_id = ${stripeSubscriptionId}
    `;
  });
}

// ─── Cleanup Function ───────────────────────────────────────────────

/**
 * Cleans up all GDPR test data for a tenant using a privileged connection.
 *
 * Opens its own connection as qs_migrate (table owner) to bypass RLS and
 * disable the audit_logs immutability trigger. Closes the connection in finally.
 *
 * Safety: asserts the tenant EID starts with 'test---gdpr-' before proceeding.
 */
export async function cleanupGdprTestData(
  tenantId: string,
  userIds?: string[],
): Promise<void> {
  const privSql = postgres(getPrivilegedUrl(), { max: 1 });

  try {
    // Safety guard: verify this is a test tenant
    const [tenant] = await privSql`
      SELECT eid FROM tenants WHERE id = ${tenantId}::uuid
    `;
    if (!tenant) {
      return;
    } // Already deleted
    if (!tenant.eid.startsWith('test---gdpr-')) {
      throw new Error(
        `SAFETY: Refusing to cleanup non-test tenant. EID: ${tenant.eid}`,
      );
    }

    await privSql.begin(async (tx) => {
      // FK-safe deletion order
      await tx`DELETE FROM shell_query_runs WHERE tenant_id = ${tenantId}::uuid`;
      await tx`DELETE FROM query_publish_events WHERE tenant_id = ${tenantId}::uuid`;
      await tx`DELETE FROM query_versions WHERE tenant_id = ${tenantId}::uuid`;
      await tx`DELETE FROM credentials WHERE tenant_id = ${tenantId}::uuid`;
      await tx`DELETE FROM saved_queries WHERE tenant_id = ${tenantId}::uuid`;
      await tx`DELETE FROM folders WHERE tenant_id = ${tenantId}::uuid`;
      await tx`DELETE FROM snippets WHERE tenant_id = ${tenantId}::uuid`;

      // audit_logs: lift RLS + disable immutability trigger
      await tx`ALTER TABLE audit_logs NO FORCE ROW LEVEL SECURITY`;
      await tx`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_delete`;
      await tx`DELETE FROM audit_logs WHERE tenant_id = ${tenantId}::uuid`;
      await tx`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_delete`;
      await tx`ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY`;

      // org_subscriptions: lift RLS
      await tx`ALTER TABLE org_subscriptions NO FORCE ROW LEVEL SECURITY`;
      await tx`DELETE FROM org_subscriptions WHERE tenant_id = ${tenantId}::uuid`;
      await tx`ALTER TABLE org_subscriptions FORCE ROW LEVEL SECURITY`;

      // Delete specific users or all tenant users
      if (userIds?.length) {
        for (const uid of userIds) {
          await tx`DELETE FROM users WHERE id = ${uid}::uuid`;
        }
      }
      await tx`DELETE FROM users WHERE tenant_id = ${tenantId}::uuid`;

      await tx`DELETE FROM deletion_ledger WHERE entity_id = ${tenantId}::uuid`;
      if (userIds?.length) {
        for (const uid of userIds) {
          await tx`DELETE FROM deletion_ledger WHERE entity_id = ${uid}::uuid`;
        }
      }

      await tx`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
    });
  } finally {
    await privSql.end();
  }
}
