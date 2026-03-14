/**
 * LifecycleCleanupService Integration Tests
 *
 * Tests handleDailyCleanup() against real PostgreSQL to verify:
 * - Hard-deletion of tenants past 30-day grace period
 * - Stripe customer deletion before DB purge
 * - Deletion ledger entries for audit trail
 * - Stripe retry/backoff with stripeAttempts metadata
 * - Audit log purging per tenant retention policy
 * - Backoffice audit log purging (365-day TTL)
 * - Stripe webhook event purging (30-day TTL)
 *
 * Uses a privileged SQL connection (qs_migrate) for seeding and cleanup
 * to bypass RLS policies and immutability triggers.
 */
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { Test, TestingModule } from "@nestjs/testing";
import {
  DatabaseModule,
  LoggerModule,
  validateWorkerEnv,
} from "@qpp/backend-shared";
import type { Sql } from "postgres";
import _postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { getPrivilegedUrl } from "../../test-helpers/privileged-db-url";
import { LifecycleCleanupService } from "../lifecycle-cleanup.service";

const stripeMock = {
  customers: { del: vi.fn().mockResolvedValue({}) },
};

describe("LifecycleCleanupService (integration)", () => {
  let module: TestingModule;
  let service: LifecycleCleanupService;
  let privSql: Sql;

  const trackedTenantIds: string[] = [];
  const trackedBackofficeAuditLogIds: string[] = [];
  const trackedWebhookEventIds: string[] = [];

  async function createExpiredTenant(
    suffix: string,
    deletedDaysAgo: number,
    opts?: {
      stripeCustomerId?: string;
      auditRetentionDays?: number;
      deletionMetadata?: Record<string, unknown>;
    },
  ): Promise<string> {
    const eid = `test---gdpr-lifecycle-${suffix}`;

    const [row] = await privSql`
      INSERT INTO tenants (eid, tssd, deleted_at)
      VALUES (
        ${eid},
        'test---lifecycle-tssd',
        ${deletedDaysAgo > 0 ? privSql`now() - interval '${privSql.unsafe(String(deletedDaysAgo))} days'` : null}
      )
      RETURNING id
    `;
    if (!row) {
      throw new Error("Failed to insert test tenant");
    }

    const tenantId = row.id as string;
    trackedTenantIds.push(tenantId);

    if (opts?.stripeCustomerId) {
      const stripeId = opts.stripeCustomerId;
      await privSql.begin(async (tx) => {
        await tx`ALTER TABLE org_subscriptions NO FORCE ROW LEVEL SECURITY`;
        await tx`
          INSERT INTO org_subscriptions (tenant_id, tier, stripe_customer_id)
          VALUES (${tenantId}::uuid, 'free', ${stripeId})
          ON CONFLICT (tenant_id) DO UPDATE
            SET stripe_customer_id = ${stripeId}
        `;
        await tx`ALTER TABLE org_subscriptions FORCE ROW LEVEL SECURITY`;
      });
    }

    if (opts?.auditRetentionDays !== undefined) {
      await privSql`
        UPDATE tenants
        SET audit_retention_days = ${opts.auditRetentionDays}
        WHERE id = ${tenantId}::uuid
      `;
    }

    if (opts?.deletionMetadata) {
      await privSql`
        UPDATE tenants
        SET deletion_metadata = ${JSON.stringify(opts.deletionMetadata)}::jsonb
        WHERE id = ${tenantId}::uuid
      `;
    }

    return tenantId;
  }

  beforeAll(async () => {
    privSql = _postgres(getPrivilegedUrl(), { max: 1 });

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateWorkerEnv,
          envFilePath: "../../.env",
        }),
        LoggerModule,
        ScheduleModule.forRoot(),
        DatabaseModule,
      ],
      providers: [
        { provide: "STRIPE_CLIENT", useValue: stripeMock },
        LifecycleCleanupService,
      ],
    }).compile();

    service = module.get(LifecycleCleanupService);
  }, 60_000);

  afterAll(async () => {
    await module.close();
    await privSql.end();
  }, 30_000);

  beforeEach(() => {
    stripeMock.customers.del.mockReset().mockResolvedValue({});
  });

  afterEach(async () => {
    for (const id of trackedTenantIds) {
      try {
        await privSql.begin(async (tx) => {
          await tx`ALTER TABLE audit_logs NO FORCE ROW LEVEL SECURITY`;
          await tx`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_delete`;
          await tx`DELETE FROM audit_logs WHERE tenant_id = ${id}::uuid`;
          await tx`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_delete`;
          await tx`ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY`;

          await tx`ALTER TABLE org_subscriptions NO FORCE ROW LEVEL SECURITY`;
          await tx`DELETE FROM org_subscriptions WHERE tenant_id = ${id}::uuid`;
          await tx`ALTER TABLE org_subscriptions FORCE ROW LEVEL SECURITY`;

          await tx`DELETE FROM deletion_ledger WHERE entity_id = ${id}::uuid`;
          await tx`DELETE FROM users WHERE tenant_id = ${id}::uuid`;
          await tx`DELETE FROM tenants WHERE id = ${id}::uuid`;
        });
      } catch {
        // Tenant may already be hard-deleted
      }
    }
    trackedTenantIds.length = 0;

    for (const id of trackedBackofficeAuditLogIds) {
      try {
        await privSql`DELETE FROM backoffice_audit_logs WHERE id = ${id}::uuid`;
      } catch {
        // Already purged
      }
    }
    trackedBackofficeAuditLogIds.length = 0;

    for (const id of trackedWebhookEventIds) {
      try {
        await privSql`DELETE FROM stripe_webhook_events WHERE id = ${id}`;
      } catch {
        // Already purged
      }
    }
    trackedWebhookEventIds.length = 0;
  });

  it("should hard-delete tenants past 30-day grace period", async () => {
    const tenantId = await createExpiredTenant("hard-delete", 31);

    await service.handleDailyCleanup();

    const rows =
      await privSql`SELECT id FROM tenants WHERE id = ${tenantId}::uuid`;
    expect(rows).toHaveLength(0);
  });

  it("should NOT delete tenants within 30-day grace period", async () => {
    const tenantId = await createExpiredTenant("within-grace", 15);

    await service.handleDailyCleanup();

    const rows =
      await privSql`SELECT id FROM tenants WHERE id = ${tenantId}::uuid`;
    expect(rows).toHaveLength(1);
  });

  it("should delete Stripe customer before DB delete", async () => {
    const tenantId = await createExpiredTenant("stripe-del", 31, {
      stripeCustomerId: "cus_lifecycle_test",
    });

    await service.handleDailyCleanup();

    expect(stripeMock.customers.del).toHaveBeenCalledWith("cus_lifecycle_test");

    const rows =
      await privSql`SELECT id FROM tenants WHERE id = ${tenantId}::uuid`;
    expect(rows).toHaveLength(0);
  });

  it("should create deletion ledger entry", async () => {
    const tenantId = await createExpiredTenant("ledger-entry", 31);

    await service.handleDailyCleanup();

    const rows = await privSql`
      SELECT deleted_by, entity_type, entity_id
      FROM deletion_ledger
      WHERE entity_id = ${tenantId}::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deleted_by).toBe("system:hard-delete-job");
    expect(rows[0]?.entity_type).toBe("tenant");
  });

  it("should increment stripeAttempts on Stripe failure and skip deletion", async () => {
    stripeMock.customers.del.mockRejectedValue(new Error("Stripe API error"));

    const tenantId = await createExpiredTenant("stripe-retry", 31, {
      stripeCustomerId: "cus_lifecycle_retry",
      deletionMetadata: { stripeAttempts: 2 },
    });

    await service.handleDailyCleanup();

    const rows =
      await privSql`SELECT id, deletion_metadata FROM tenants WHERE id = ${tenantId}::uuid`;
    expect(rows).toHaveLength(1);
    expect(
      Number(
        (rows[0]?.deletion_metadata as Record<string, unknown>)?.stripeAttempts,
      ),
    ).toBe(3);
  });

  it("should purge audit logs past tenant retention period", async () => {
    const tenantId = await createExpiredTenant("audit-purge", 0, {
      auditRetentionDays: 90,
    });

    const [user] = await privSql`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES (${"sf-lifecycle-audit"}, ${tenantId}::uuid, 'audit@test.lifecycle', 'Audit Test User')
      RETURNING id
    `;
    if (!user) {
      throw new Error("Failed to insert test user");
    }

    let oldLogId = "";
    let recentLogId = "";

    await privSql.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx`SELECT set_config('app.mid', 'mid-lifecycle', true)`;

      const [oldRow] = await tx`
        INSERT INTO audit_logs (tenant_id, mid, event_type, actor_type, actor_id, ip_address, user_agent)
        VALUES (${tenantId}::uuid, 'mid-lifecycle', 'lifecycle.test_old', 'user', ${user.id}::uuid, '127.0.0.1', 'test-agent')
        RETURNING id
      `;
      if (!oldRow) {
        throw new Error("Failed to insert old audit log");
      }
      oldLogId = oldRow.id;

      const [recentRow] = await tx`
        INSERT INTO audit_logs (tenant_id, mid, event_type, actor_type, actor_id, ip_address, user_agent)
        VALUES (${tenantId}::uuid, 'mid-lifecycle', 'lifecycle.test_recent', 'user', ${user.id}::uuid, '127.0.0.1', 'test-agent')
        RETURNING id
      `;
      if (!recentRow) {
        throw new Error("Failed to insert recent audit log");
      }
      recentLogId = recentRow.id;
    });

    await privSql`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update`;
    await privSql`UPDATE audit_logs SET created_at = now() - interval '100 days' WHERE id = ${oldLogId}::uuid`;
    await privSql`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_update`;

    await service.handleDailyCleanup();

    const oldRows =
      await privSql`SELECT id FROM audit_logs WHERE id = ${oldLogId}::uuid`;
    expect(oldRows).toHaveLength(0);

    const recentRows =
      await privSql`SELECT id FROM audit_logs WHERE id = ${recentLogId}::uuid`;
    expect(recentRows).toHaveLength(1);
  });

  it("should purge backoffice audit logs older than 365 days", async () => {
    const [oldRow] = await privSql`
      INSERT INTO backoffice_audit_logs (event_type, metadata, ip_address)
      VALUES ('lifecycle.test_old', '{}'::jsonb, '127.0.0.1')
      RETURNING id
    `;
    if (!oldRow) {
      throw new Error("Failed to insert old backoffice audit log");
    }
    const oldId = oldRow.id as string;
    trackedBackofficeAuditLogIds.push(oldId);

    const [recentRow] = await privSql`
      INSERT INTO backoffice_audit_logs (event_type, metadata, ip_address)
      VALUES ('lifecycle.test_recent', '{}'::jsonb, '127.0.0.1')
      RETURNING id
    `;
    if (!recentRow) {
      throw new Error("Failed to insert recent backoffice audit log");
    }
    const recentId = recentRow.id as string;
    trackedBackofficeAuditLogIds.push(recentId);

    await privSql`UPDATE backoffice_audit_logs SET created_at = now() - interval '370 days' WHERE id = ${oldId}::uuid`;

    await service.handleDailyCleanup();

    const oldRows =
      await privSql`SELECT id FROM backoffice_audit_logs WHERE id = ${oldId}::uuid`;
    expect(oldRows).toHaveLength(0);

    const recentRows =
      await privSql`SELECT id FROM backoffice_audit_logs WHERE id = ${recentId}::uuid`;
    expect(recentRows).toHaveLength(1);
  });

  it("should purge webhook events older than 30 days", async () => {
    const oldEventId = `evt_lifecycle_old_${Date.now()}`;
    const recentEventId = `evt_lifecycle_recent_${Date.now()}`;

    await privSql`
      INSERT INTO stripe_webhook_events (id, event_type, status, processed_at)
      VALUES (${oldEventId}, 'invoice.paid', 'completed', now() - interval '35 days')
    `;
    trackedWebhookEventIds.push(oldEventId);

    await privSql`
      INSERT INTO stripe_webhook_events (id, event_type, status, processed_at)
      VALUES (${recentEventId}, 'invoice.paid', 'completed', now() - interval '5 days')
    `;
    trackedWebhookEventIds.push(recentEventId);

    await service.handleDailyCleanup();

    const oldRows =
      await privSql`SELECT id FROM stripe_webhook_events WHERE id = ${oldEventId}`;
    expect(oldRows).toHaveLength(0);

    const recentRows =
      await privSql`SELECT id FROM stripe_webhook_events WHERE id = ${recentEventId}`;
    expect(recentRows).toHaveLength(1);
  });
});
