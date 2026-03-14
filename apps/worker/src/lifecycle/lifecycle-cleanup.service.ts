import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  and,
  auditLogs,
  backofficeAuditLogs,
  deletionLedger,
  eq,
  isNotNull,
  orgSubscriptions,
  type PostgresJsDatabase,
  sql,
  stripeWebhookEvents,
  tenants,
} from "@qpp/database";
import type Stripe from "stripe";

@Injectable()
export class LifecycleCleanupService {
  private readonly logger = new Logger(LifecycleCleanupService.name);

  constructor(
    @Inject("DATABASE")
    private readonly db: PostgresJsDatabase<Record<string, never>>,
    @Optional()
    @Inject("STRIPE_CLIENT")
    private readonly stripe: Stripe | null,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleDailyCleanup() {
    this.logger.log("Starting daily lifecycle cleanup...");
    await this.hardDeleteExpiredTenants();
    await this.purgeExpiredAuditLogs();
    await this.purgeExpiredBackofficeAuditLogs();
    await this.purgeExpiredStripeWebhookEvents();
    this.logger.log("Daily lifecycle cleanup completed.");
  }

  private async hardDeleteExpiredTenants(): Promise<void> {
    try {
      const expired = await this.db
        .select({
          id: tenants.id,
          eid: tenants.eid,
          deletionMetadata: tenants.deletionMetadata,
        })
        .from(tenants)
        .where(
          and(
            isNotNull(tenants.deletedAt),
            sql`${tenants.deletedAt} + interval '30 days' < now()`,
          ),
        );

      this.logger.log(
        `Found ${expired.length} tenants past 30-day grace period`,
      );

      for (const tenant of expired) {
        try {
          await this.processExpiredTenant(tenant);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          this.logger.error(
            `Failed to hard-delete tenant ${tenant.id} (eid: ${tenant.eid}): ${message}`,
          );
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Failed to query expired tenants: ${message}`);
    }
  }

  private async processExpiredTenant(tenant: {
    id: string;
    eid: string;
    deletionMetadata: Record<string, unknown> | null;
  }): Promise<void> {
    const stripeCustomerId = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`,
      );
      const [sub] = await tx
        .select({ stripeCustomerId: orgSubscriptions.stripeCustomerId })
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.tenantId, tenant.id))
        .limit(1);
      return sub?.stripeCustomerId ?? null;
    });

    if (stripeCustomerId && this.stripe) {
      try {
        await this.stripe.customers.del(stripeCustomerId);
        this.logger.log(
          `Deleted Stripe customer ${stripeCustomerId} for tenant ${tenant.id}`,
        );
      } catch {
        const currentAttempts =
          ((tenant.deletionMetadata as Record<string, unknown>)
            ?.stripeAttempts as number) ?? 0;
        const newAttempts = currentAttempts + 1;

        await this.db
          .update(tenants)
          .set({
            deletionMetadata: sql`jsonb_set(
              COALESCE(${tenants.deletionMetadata}, '{}'),
              '{stripeAttempts}',
              to_jsonb(${newAttempts}::int)
            )`,
          })
          .where(eq(tenants.id, tenant.id));

        if (newAttempts >= 5) {
          this.logger.error(
            `ALERT: Stripe deletion failed 5+ times for tenant ${tenant.id} (eid: ${tenant.eid})`,
          );
        } else {
          this.logger.warn(
            `Stripe deletion failed for tenant ${tenant.id}, attempt ${newAttempts}/5 — will retry next day`,
          );
        }

        return;
      }
    }

    await this.db.insert(deletionLedger).values({
      entityType: "tenant",
      entityId: tenant.id,
      entityIdentifier: tenant.eid,
      deletedBy: "system:hard-delete-job",
      metadata: { stripeCustomerId },
    });

    await this.db.delete(tenants).where(eq(tenants.id, tenant.id));

    this.logger.log(`Hard-deleted tenant ${tenant.id} (eid: ${tenant.eid})`);
  }

  private async purgeExpiredAuditLogs(): Promise<void> {
    try {
      const tenantsWithRetention = await this.db
        .select({
          id: tenants.id,
          auditRetentionDays: tenants.auditRetentionDays,
        })
        .from(tenants)
        .where(isNotNull(tenants.auditRetentionDays));

      let totalPurged = 0;

      for (const tenant of tenantsWithRetention) {
        const retentionDays = tenant.auditRetentionDays ?? 90;
        const deleted = await this.db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`,
          );
          await tx.execute(
            sql`SELECT set_config('app.audit_retention_purge', 'on', true)`,
          );
          return tx
            .delete(auditLogs)
            .where(
              and(
                eq(auditLogs.tenantId, tenant.id),
                sql`${auditLogs.createdAt} < now() - make_interval(days => ${retentionDays})`,
              ),
            )
            .returning({ id: auditLogs.id });
        });

        totalPurged += deleted.length;
      }

      if (totalPurged > 0) {
        this.logger.log(`Purged ${totalPurged} expired audit log entries`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Failed to purge audit logs: ${message}`);
    }
  }

  private async purgeExpiredBackofficeAuditLogs(): Promise<void> {
    try {
      const deleted = await this.db
        .delete(backofficeAuditLogs)
        .where(
          sql`${backofficeAuditLogs.createdAt} < now() - make_interval(days => 365)`,
        )
        .returning({ id: backofficeAuditLogs.id });

      if (deleted.length > 0) {
        this.logger.log(
          `Purged ${deleted.length} expired backoffice audit log entries`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Failed to purge backoffice audit logs: ${message}`);
    }
  }

  private async purgeExpiredStripeWebhookEvents(): Promise<void> {
    try {
      const deleted = await this.db
        .delete(stripeWebhookEvents)
        .where(
          sql`${stripeWebhookEvents.processedAt} < now() - interval '30 days'`,
        )
        .returning({ id: stripeWebhookEvents.id });

      if (deleted.length > 0) {
        this.logger.log(
          `Purged ${deleted.length} expired Stripe webhook events`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Failed to purge Stripe webhook events: ${message}`);
    }
  }
}
