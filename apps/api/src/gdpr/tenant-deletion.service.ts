import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { deletionLedger, eq, orgSubscriptions, tenants } from '@qpp/database';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type Stripe from 'stripe';

import { BullmqCleanupService } from './bullmq-cleanup.service';
import { RedisCleanupService } from './redis-cleanup.service';

@Injectable()
export class TenantDeletionService {
  private readonly logger = new Logger(TenantDeletionService.name);

  constructor(
    @Inject('DATABASE') private readonly db: PostgresJsDatabase,
    @Optional() @Inject('STRIPE_CLIENT') private readonly stripe: Stripe | null,
    private readonly redisCleanupService: RedisCleanupService,
    private readonly bullmqCleanupService: BullmqCleanupService,
  ) {}

  async softDeleteTenant(tenantId: string, actorId: string): Promise<void> {
    const [tenant] = await this.db
      .select({ id: tenants.id, eid: tenants.eid })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    // 1. Set deleted_at FIRST — blocks further API access via SessionGuard
    await this.db
      .update(tenants)
      .set({ deletedAt: new Date() })
      .where(eq(tenants.id, tenantId));

    this.logger.log(`Tenant ${tenantId} marked as soft-deleted`);

    // 2. Cancel Stripe subscription (error-tolerant)
    let subscription:
      | { stripeSubscriptionId: string | null; stripeCustomerId: string | null }
      | undefined;
    try {
      const [sub] = await this.db
        .select({
          stripeSubscriptionId: orgSubscriptions.stripeSubscriptionId,
          stripeCustomerId: orgSubscriptions.stripeCustomerId,
        })
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.tenantId, tenantId))
        .limit(1);

      subscription = sub;

      if (sub?.stripeSubscriptionId && this.stripe) {
        await this.stripe.subscriptions.cancel(sub.stripeSubscriptionId, {
          prorate: true,
        });
        this.logger.log(
          `Cancelled Stripe subscription ${sub.stripeSubscriptionId} for tenant ${tenantId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to cancel Stripe subscription for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    // 3. Purge Redis keys
    await this.redisCleanupService.purgeForTenant(tenantId);

    // 4. Remove BullMQ jobs
    await this.bullmqCleanupService.removeJobsForTenant(tenantId);

    // 5. Log to deletion ledger
    await this.db.insert(deletionLedger).values({
      entityType: 'tenant',
      entityId: tenantId,
      entityIdentifier: tenant.eid,
      deletedBy: `admin:${actorId}`,
      metadata: {
        stripeCustomerId: subscription?.stripeCustomerId ?? null,
      },
    });

    this.logger.log(
      `Tenant soft-delete completed: ${tenantId} (eid: ${tenant.eid})`,
    );
  }
}
