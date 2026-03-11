import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PostgresJsDatabase } from "@qpp/database";
import { eq, orgSubscriptions, stripeBillingBindings } from "@qpp/database";
import type Stripe from "stripe";

import { BackofficeAuditService } from "../audit/audit.service.js";
import { DRIZZLE_DB } from "../database/database.module.js";
import { STRIPE_CLIENT } from "../stripe/stripe.provider.js";
import type { StripeCatalogService } from "../stripe/stripe-catalog.service.js";
import type {
  BillingInterval,
  PaidTier,
} from "../stripe/stripe-catalog.service.js";

@Injectable()
export class TierManagementService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: PostgresJsDatabase,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    @Inject("BackofficeAuditService")
    private readonly auditService: BackofficeAuditService,
    @Inject("StripeCatalogService")
    private readonly catalogService: StripeCatalogService,
  ) {}

  async changeTier(
    tenantId: string,
    newTier: PaidTier,
    interval: BillingInterval,
    backofficeUserId: string,
    ip: string,
  ): Promise<void> {
    const binding = await this.getBillingBinding(tenantId);

    const newPriceId = await this.catalogService.resolveCheckoutPriceId(
      newTier,
      interval,
    );

    const subscription = await this.stripe.subscriptions.retrieve(
      binding.stripeSubscriptionId,
    );

    const currentItem = subscription.items.data[0];
    if (!currentItem) {
      throw new NotFoundException("No subscription items found");
    }

    await this.stripe.subscriptions.update(binding.stripeSubscriptionId, {
      items: [{ id: currentItem.id, price: newPriceId }],
      proration_behavior: "create_prorations",
    });

    await this.db
      .update(orgSubscriptions)
      .set({ tier: newTier, updatedAt: new Date() })
      .where(eq(orgSubscriptions.tenantId, tenantId));

    void this.auditService.log({
      backofficeUserId,
      targetTenantId: tenantId,
      eventType: "backoffice.tier_changed",
      metadata: { newTier, interval },
      ipAddress: ip,
    });
  }

  async cancelSubscription(
    tenantId: string,
    backofficeUserId: string,
    ip: string,
  ): Promise<void> {
    const binding = await this.getBillingBinding(tenantId);

    await this.stripe.subscriptions.cancel(binding.stripeSubscriptionId);

    await this.db
      .update(orgSubscriptions)
      .set({
        stripeSubscriptionStatus: "canceled",
        updatedAt: new Date(),
      })
      .where(eq(orgSubscriptions.tenantId, tenantId));

    void this.auditService.log({
      backofficeUserId,
      targetTenantId: tenantId,
      eventType: "backoffice.subscription_canceled",
      metadata: { subscriptionId: binding.stripeSubscriptionId },
      ipAddress: ip,
    });
  }

  private async getBillingBinding(tenantId: string) {
    const rows = await this.db
      .select()
      .from(stripeBillingBindings)
      .where(eq(stripeBillingBindings.tenantId, tenantId))
      .limit(1);

    const binding = rows[0];
    if (!binding?.stripeSubscriptionId) {
      throw new NotFoundException(
        `No Stripe billing binding found for tenant ${tenantId}`,
      );
    }
    return { ...binding, stripeSubscriptionId: binding.stripeSubscriptionId };
  }
}
