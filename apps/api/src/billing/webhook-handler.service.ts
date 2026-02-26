import { Inject, Injectable, Logger } from '@nestjs/common';
import { EncryptionService, RlsContextService } from '@qpp/backend-shared';
import type {
  IOrgSubscriptionRepository,
  IStripeWebhookEventRepository,
  ITenantRepository,
  OrgSubscription,
} from '@qpp/database';
import type Stripe from 'stripe';

import { AuditService } from '../audit/audit.service';
import { STRIPE_CLIENT } from './stripe.provider';

const VALID_TIERS = ['pro', 'enterprise'] as const;
type PaidTier = (typeof VALID_TIERS)[number];

function isValidPaidTier(value: unknown): value is PaidTier {
  return typeof value === 'string' && VALID_TIERS.includes(value as PaidTier);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStripeId(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (isRecord(value) && typeof value.id === 'string') {
    return value.id;
  }
  return null;
}

@Injectable()
export class WebhookHandlerService {
  private readonly logger = new Logger(WebhookHandlerService.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    @Inject('ORG_SUBSCRIPTION_REPOSITORY')
    private readonly orgSubscriptionRepo: IOrgSubscriptionRepository,
    @Inject('STRIPE_WEBHOOK_EVENT_REPOSITORY')
    private readonly webhookEventRepo: IStripeWebhookEventRepository,
    @Inject('TENANT_REPOSITORY')
    private readonly tenantRepo: ITenantRepository,
    private readonly rlsContext: RlsContextService,
    private readonly auditService: AuditService,
    private readonly encryptionService: EncryptionService,
  ) {}

  private async auditWebhookConflict(
    tenantId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditService.log({
        eventType: 'subscription.webhook_conflict',
        actorType: 'system',
        actorId: null,
        tenantId,
        mid: 'system',
        targetId: tenantId,
        metadata,
      });
    } catch (error) {
      this.logger.warn(
        'Failed to write subscription.webhook_conflict audit event',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private checkStripeBinding(
    existing: OrgSubscription,
    incoming: {
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
    },
    options: {
      allowBindWhenUnbound: boolean;
      requireSubscriptionMatch?: boolean;
    },
  ): { allowed: true } | { allowed: false; reason: string } {
    const { stripeCustomerId, stripeSubscriptionId } = incoming;

    if (!options.allowBindWhenUnbound) {
      const isBound =
        Boolean(existing.stripeCustomerId) ||
        Boolean(existing.stripeSubscriptionId);
      if (!isBound) {
        return {
          allowed: false,
          reason:
            'Tenant is not bound to any Stripe identity (missing stripeCustomerId/stripeSubscriptionId)',
        };
      }
    }

    if (
      existing.stripeCustomerId &&
      stripeCustomerId &&
      existing.stripeCustomerId !== stripeCustomerId
    ) {
      return {
        allowed: false,
        reason: 'Incoming Stripe customer does not match existing binding',
      };
    }

    if (
      existing.stripeSubscriptionId &&
      stripeSubscriptionId &&
      existing.stripeSubscriptionId !== stripeSubscriptionId
    ) {
      return {
        allowed: false,
        reason: 'Incoming Stripe subscription does not match existing binding',
      };
    }

    if (options.requireSubscriptionMatch) {
      if (!existing.stripeSubscriptionId) {
        return {
          allowed: false,
          reason:
            'Refusing to apply destructive update without existing stripeSubscriptionId binding',
        };
      }
      if (!stripeSubscriptionId) {
        return {
          allowed: false,
          reason:
            'Missing incoming stripeSubscriptionId for destructive update',
        };
      }
      if (existing.stripeSubscriptionId !== stripeSubscriptionId) {
        return {
          allowed: false,
          reason:
            'Incoming Stripe subscription does not match existing binding (destructive update)',
        };
      }
    }

    return { allowed: true };
  }

  private decryptEidToken(token: string): string {
    try {
      const decrypted = this.encryptionService.decrypt(token);
      if (typeof decrypted === 'string' && decrypted.trim()) {
        return decrypted;
      }
    } catch {
      // fall through
    }

    throw new Error(
      'Invalid metadata.eid token — must be an encrypted token issued by GET /api/billing/pricing-token',
    );
  }

  async process(event: Stripe.Event): Promise<void> {
    this.logger.debug(`Processing event: ${event.type} (${event.id})`);

    const shouldProcess = await this.webhookEventRepo.markProcessing(
      event.id,
      event.type,
    );
    if (!shouldProcess) {
      this.logger.warn(
        `[DIAG] Event already completed or in progress, skipped: ${event.id}`,
      );
      return;
    }

    try {
      const eventType: string = event.type;
      switch (eventType) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(
            event.data.object as Stripe.Checkout.Session,
          );
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionChange(
            event.data.object as Stripe.Subscription,
          );
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription,
          );
          break;
        case 'invoice.paid':
          await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
          break;
        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(
            event.data.object as Stripe.Invoice,
          );
          break;
        default:
          this.logger.debug(`Unhandled event type: ${eventType}`);
          break;
      }
      await this.webhookEventRepo.markCompleted(event.id);
    } catch (error) {
      this.logger.error(
        `[DIAG] Event processing FAILED — ${event.type} (${event.id}): ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.webhookEventRepo.markFailed(
        event.id,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const stripeCustomerId = getStripeId(session.customer);
    const stripeSubscriptionId = getStripeId(session.subscription);

    this.logger.debug(
      `checkout.session.completed — customerId: ${stripeCustomerId}, subscriptionId: ${stripeSubscriptionId}`,
    );
    this.logger.debug(
      `checkout.session.completed — metadata keys: ${Object.keys(session.metadata ?? {}).join(', ')}`,
    );

    if (!stripeCustomerId || !stripeSubscriptionId) {
      throw new Error('Checkout session missing customer or subscription ID');
    }

    const rawEid = session.metadata?.eid;
    if (!rawEid) {
      throw new Error('Checkout session missing metadata.eid');
    }
    const eid = this.decryptEidToken(rawEid);

    if (!this.stripe) {
      throw new Error('Stripe client not configured');
    }

    const subscription =
      await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
    if (!subscription.items.data[0]) {
      throw new Error('Stripe subscription missing line items');
    }
    const productId = subscription.items.data[0].price.product as string;
    const tier = await this.resolveTierFromProduct(productId);

    const tenant = await this.tenantRepo.findByEid(eid);
    this.logger.debug(
      `checkout.session.completed — tenant found: ${!!tenant}, tenantId: ${tenant?.id}`,
    );
    if (!tenant) {
      throw new Error(`Tenant not found for pricing token`);
    }

    await this.rlsContext.runWithTenantContext(
      tenant.id,
      'system',
      async () => {
        const existing = await this.orgSubscriptionRepo.findByTenantId(
          tenant.id,
        );
        if (!existing) {
          await this.orgSubscriptionRepo.upsert({
            tenantId: tenant.id,
            tier,
            stripeCustomerId,
            stripeSubscriptionId,
            trialEndsAt: null,
            currentPeriodEnds: null,
            seatLimit: null,
          });
          return;
        }

        const binding = this.checkStripeBinding(
          existing,
          { stripeCustomerId, stripeSubscriptionId },
          { allowBindWhenUnbound: true },
        );
        if (!binding.allowed) {
          this.logger.warn(
            `checkout.session.completed — ignored due to Stripe binding conflict (tenantId=${tenant.id})`,
          );
          await this.auditWebhookConflict(tenant.id, {
            reason: binding.reason,
            eventType: 'checkout.session.completed',
            incomingStripeCustomerId: stripeCustomerId,
            incomingStripeSubscriptionId: stripeSubscriptionId,
            existingStripeCustomerId: existing.stripeCustomerId,
            existingStripeSubscriptionId: existing.stripeSubscriptionId,
          });
          return;
        }

        await this.orgSubscriptionRepo.updateFromWebhook(tenant.id, {
          stripeCustomerId,
          stripeSubscriptionId,
          tier,
          trialEndsAt: null,
        });
      },
    );

    await this.auditService.log({
      eventType: 'subscription.created',
      actorType: 'system',
      actorId: null,
      tenantId: tenant.id,
      mid: 'system',
      targetId: tenant.id,
      metadata: { tier, stripeCustomerId, stripeSubscriptionId },
    });
  }

  private async handleSubscriptionChange(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    this.logger.debug(
      `subscription change — status: ${subscription.status}, metadata keys: ${Object.keys(subscription.metadata ?? {}).join(', ')}`,
    );

    if (!subscription.items.data[0]) {
      throw new Error('Subscription event missing line items');
    }

    const rawEid = subscription.metadata?.eid;
    if (!rawEid) {
      throw new Error(
        'Subscription missing metadata.eid — external pricing site must set subscription_data.metadata.eid at Checkout creation',
      );
    }
    const eid = this.decryptEidToken(rawEid);

    const tenant = await this.tenantRepo.findByEid(eid);
    this.logger.debug(`subscription change — tenant found: ${!!tenant}`);
    if (!tenant) {
      this.logger.warn(
        `Tenant not found for pricing token — tenant may have been deleted`,
      );
      return;
    }

    const productId = subscription.items.data[0].price.product as string;
    this.logger.debug(
      `subscription change — resolving tier from product: ${productId}`,
    );
    const tier = await this.resolveTierFromProduct(productId);
    this.logger.debug(`subscription change — resolved tier: ${tier}`);

    const isPastDueOrUnpaid =
      subscription.status === 'past_due' || subscription.status === 'unpaid';

    const currentPeriodEnds = new Date(
      subscription.items.data[0].current_period_end * 1000,
    );
    const seatLimit = subscription.items.data[0].quantity ?? null;
    const stripeCustomerId = getStripeId(subscription.customer);
    const stripeSubscriptionId = subscription.id;

    await this.rlsContext.runWithTenantContext(
      tenant.id,
      'system',
      async () => {
        const existing = await this.orgSubscriptionRepo.findByTenantId(
          tenant.id,
        );
        if (!existing) {
          await this.orgSubscriptionRepo.upsert({
            tenantId: tenant.id,
            // If the row doesn't exist yet, persist the resolved tier even if
            // Stripe is reporting past_due/unpaid. The "graceful degradation"
            // behavior applies to preserving an existing tier, not defaulting
            // a brand-new row to free.
            tier,
            stripeCustomerId,
            stripeSubscriptionId,
            trialEndsAt: null,
            currentPeriodEnds,
            seatLimit,
          });
          return;
        }

        const binding = this.checkStripeBinding(
          existing,
          { stripeCustomerId, stripeSubscriptionId },
          { allowBindWhenUnbound: true },
        );
        if (!binding.allowed) {
          this.logger.warn(
            `subscription change — ignored due to Stripe binding conflict (tenantId=${tenant.id})`,
          );
          await this.auditWebhookConflict(tenant.id, {
            reason: binding.reason,
            eventType: 'customer.subscription.created/updated',
            incomingStripeCustomerId: stripeCustomerId,
            incomingStripeSubscriptionId: stripeSubscriptionId,
            existingStripeCustomerId: existing.stripeCustomerId,
            existingStripeSubscriptionId: existing.stripeSubscriptionId,
          });
          return;
        }

        await this.orgSubscriptionRepo.updateFromWebhook(tenant.id, {
          ...(isPastDueOrUnpaid ? {} : { tier }),
          stripeCustomerId,
          stripeSubscriptionId,
          currentPeriodEnds,
          seatLimit,
          trialEndsAt: null,
        });
      },
    );

    await this.auditService.log({
      eventType: 'subscription.updated',
      actorType: 'system',
      actorId: null,
      tenantId: tenant.id,
      mid: 'system',
      targetId: tenant.id,
      metadata: {
        tier: isPastDueOrUnpaid ? 'unchanged (graceful degradation)' : tier,
        status: subscription.status,
        currentPeriodEnds: currentPeriodEnds.toISOString(),
        seatLimit,
      },
    });
  }

  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const rawEid = subscription.metadata?.eid;
    if (!rawEid) {
      throw new Error('Subscription missing metadata.eid');
    }
    const eid = this.decryptEidToken(rawEid);

    const tenant = await this.tenantRepo.findByEid(eid);
    if (!tenant) {
      this.logger.warn(
        `Tenant not found for pricing token on subscription.deleted`,
      );
      return;
    }

    const stripeCustomerId = getStripeId(subscription.customer);
    const stripeSubscriptionId = subscription.id;

    await this.rlsContext.runWithTenantContext(
      tenant.id,
      'system',
      async () => {
        const existing = await this.orgSubscriptionRepo.findByTenantId(
          tenant.id,
        );
        if (!existing) {
          this.logger.warn(
            `subscription.deleted — ignored (org_subscriptions missing, tenantId=${tenant.id})`,
          );
          return;
        }

        const binding = this.checkStripeBinding(
          existing,
          { stripeCustomerId, stripeSubscriptionId },
          { allowBindWhenUnbound: false, requireSubscriptionMatch: true },
        );
        if (!binding.allowed) {
          this.logger.warn(
            `subscription.deleted — ignored due to Stripe binding conflict (tenantId=${tenant.id})`,
          );
          await this.auditWebhookConflict(tenant.id, {
            reason: binding.reason,
            eventType: 'customer.subscription.deleted',
            incomingStripeCustomerId: stripeCustomerId,
            incomingStripeSubscriptionId: stripeSubscriptionId,
            existingStripeCustomerId: existing.stripeCustomerId,
            existingStripeSubscriptionId: existing.stripeSubscriptionId,
          });
          return;
        }

        await this.orgSubscriptionRepo.updateFromWebhook(tenant.id, {
          tier: 'free',
          stripeSubscriptionId: null,
          currentPeriodEnds: null,
          seatLimit: null,
        });
      },
    );

    await this.auditService.log({
      eventType: 'subscription.canceled',
      actorType: 'system',
      actorId: null,
      tenantId: tenant.id,
      mid: 'system',
      targetId: tenant.id,
    });
  }

  private getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    const sub = invoice.parent?.subscription_details?.subscription;
    if (!sub) {
      return null;
    }
    return typeof sub === 'string' ? sub : sub.id;
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = this.getInvoiceSubscriptionId(invoice);
    if (!subscriptionId) {
      return;
    }

    if (!this.stripe) {
      throw new Error('Stripe client not configured');
    }

    const subscription =
      await this.stripe.subscriptions.retrieve(subscriptionId);
    const rawEid = subscription.metadata?.eid;
    if (!rawEid) {
      this.logger.warn(
        'invoice.paid: subscription missing metadata.eid — skipping',
      );
      return;
    }
    const eid = this.decryptEidToken(rawEid);

    const tenant = await this.tenantRepo.findByEid(eid);
    if (!tenant) {
      this.logger.warn(
        `invoice.paid: tenant not found for pricing token — skipping`,
      );
      return;
    }

    const stripeCustomerId = getStripeId(subscription.customer);

    await this.rlsContext.runWithTenantContext(
      tenant.id,
      'system',
      async () => {
        const existing = await this.orgSubscriptionRepo.findByTenantId(
          tenant.id,
        );
        if (!existing) {
          this.logger.warn(
            `invoice.paid — ignored (org_subscriptions missing, tenantId=${tenant.id})`,
          );
          return;
        }

        const binding = this.checkStripeBinding(
          existing,
          { stripeCustomerId, stripeSubscriptionId: subscription.id },
          { allowBindWhenUnbound: false, requireSubscriptionMatch: true },
        );
        if (!binding.allowed) {
          this.logger.warn(
            `invoice.paid — ignored due to Stripe binding conflict (tenantId=${tenant.id})`,
          );
          await this.auditWebhookConflict(tenant.id, {
            reason: binding.reason,
            eventType: 'invoice.paid',
            invoiceId: invoice.id,
            incomingStripeCustomerId: stripeCustomerId,
            incomingStripeSubscriptionId: subscription.id,
            existingStripeCustomerId: existing.stripeCustomerId,
            existingStripeSubscriptionId: existing.stripeSubscriptionId,
          });
          return;
        }

        await this.orgSubscriptionRepo.updateFromWebhook(tenant.id, {
          currentPeriodEnds: new Date(invoice.period_end * 1000),
        });
      },
    );

    await this.auditService.log({
      eventType: 'subscription.updated',
      actorType: 'system',
      actorId: null,
      tenantId: tenant.id,
      mid: 'system',
      targetId: tenant.id,
      metadata: {
        invoiceId: invoice.id,
        currentPeriodEnds: new Date(invoice.period_end * 1000).toISOString(),
      },
    });
  }

  private async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const subscriptionId = this.getInvoiceSubscriptionId(invoice);
    if (!subscriptionId) {
      return;
    }

    if (!this.stripe) {
      this.logger.warn(
        'invoice.payment_failed: Stripe client not configured — skipping audit',
      );
      return;
    }

    try {
      const subscription =
        await this.stripe.subscriptions.retrieve(subscriptionId);
      const rawEid = subscription.metadata?.eid;
      if (!rawEid) {
        this.logger.warn(
          'invoice.payment_failed: subscription missing metadata.eid — skipping',
        );
        return;
      }
      const eid = this.decryptEidToken(rawEid);

      const tenant = await this.tenantRepo.findByEid(eid);
      if (!tenant) {
        this.logger.warn(
          `invoice.payment_failed: tenant not found for pricing token — skipping`,
        );
        return;
      }

      const stripeCustomerId = getStripeId(subscription.customer);
      const stripeSubscriptionId = subscription.id;

      const canAudit = await this.rlsContext.runWithTenantContext(
        tenant.id,
        'system',
        async () => {
          const existing = await this.orgSubscriptionRepo.findByTenantId(
            tenant.id,
          );
          if (!existing) {
            return false;
          }
          const binding = this.checkStripeBinding(
            existing,
            { stripeCustomerId, stripeSubscriptionId },
            { allowBindWhenUnbound: false, requireSubscriptionMatch: true },
          );
          if (!binding.allowed) {
            await this.auditWebhookConflict(tenant.id, {
              reason: binding.reason,
              eventType: 'invoice.payment_failed',
              invoiceId: invoice.id,
              incomingStripeCustomerId: stripeCustomerId,
              incomingStripeSubscriptionId: stripeSubscriptionId,
              existingStripeCustomerId: existing.stripeCustomerId,
              existingStripeSubscriptionId: existing.stripeSubscriptionId,
            });
            return false;
          }
          return true;
        },
      );

      if (!canAudit) {
        return;
      }

      await this.auditService.log({
        eventType: 'subscription.payment_failed',
        actorType: 'system',
        actorId: null,
        tenantId: tenant.id,
        mid: 'system',
        targetId: tenant.id,
        metadata: { invoiceId: invoice.id },
      });
    } catch (error) {
      this.logger.warn(
        'invoice.payment_failed: failed to resolve tenant for audit',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async resolveTierFromProduct(productId: string): Promise<PaidTier> {
    if (!this.stripe) {
      throw new Error('Stripe client not configured');
    }
    const product = await this.stripe.products.retrieve(productId);
    this.logger.debug(
      `resolveTierFromProduct — product: ${productId}, metadata keys: ${Object.keys(product.metadata ?? {}).join(', ')}`,
    );
    const tier = product.metadata?.tier;
    if (!isValidPaidTier(tier)) {
      throw new Error(
        `Stripe product ${productId} missing valid metadata.tier (got: ${tier})`,
      );
    }
    return tier;
  }
}
