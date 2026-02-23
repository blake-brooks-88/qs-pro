import { Inject, Injectable, Logger } from '@nestjs/common';
import { EncryptionService, RlsContextService } from '@qpp/backend-shared';
import type {
  IOrgSubscriptionRepository,
  IStripeWebhookEventRepository,
  ITenantRepository,
} from '@qpp/database';
import type Stripe from 'stripe';

import { AuditService } from '../audit/audit.service';
import { STRIPE_CLIENT } from './stripe.provider';

const VALID_TIERS = ['pro', 'enterprise'] as const;
type PaidTier = (typeof VALID_TIERS)[number];

function isValidPaidTier(value: unknown): value is PaidTier {
  return typeof value === 'string' && VALID_TIERS.includes(value as PaidTier);
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

    const isNew = await this.webhookEventRepo.markProcessing(
      event.id,
      event.type,
    );
    if (!isNew) {
      this.logger.warn(`[DIAG] Duplicate event skipped: ${event.id}`);
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
    const stripeCustomerId = session.customer as string | null;
    const stripeSubscriptionId = session.subscription as string | null;

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
      `checkout.session.completed — eid: ${eid}, tenant found: ${!!tenant}, tenantId: ${tenant?.id}`,
    );
    if (!tenant) {
      throw new Error(`Tenant not found for eid: ${eid}`);
    }

    await this.rlsContext.runWithTenantContext(
      tenant.id,
      'system',
      async () => {
        this.logger.debug(
          `checkout.session.completed — updating subscription: tier=${tier}, tenantId=${tenant.id}`,
        );
        await this.orgSubscriptionRepo.updateFromWebhook(tenant.id, {
          stripeCustomerId,
          stripeSubscriptionId,
          tier,
        });
        this.logger.debug(`checkout.session.completed — DB update complete`);
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
    this.logger.debug(
      `subscription change — eid: ${eid}, tenant found: ${!!tenant}`,
    );
    if (!tenant) {
      this.logger.warn(
        `Tenant not found for eid=${eid} — tenant may have been deleted`,
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

    await this.rlsContext.runWithTenantContext(
      tenant.id,
      'system',
      async () => {
        await this.orgSubscriptionRepo.updateFromWebhook(tenant.id, {
          ...(isPastDueOrUnpaid ? {} : { tier }),
          currentPeriodEnds,
          seatLimit,
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
        `Tenant not found for eid=${eid} on subscription.deleted`,
      );
      return;
    }

    await this.rlsContext.runWithTenantContext(
      tenant.id,
      'system',
      async () => {
        await this.orgSubscriptionRepo.updateFromWebhook(tenant.id, {
          tier: 'free',
          stripeSubscriptionId: null,
          currentPeriodEnds: null,
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
        `invoice.paid: tenant not found for eid=${eid} — skipping`,
      );
      return;
    }

    await this.rlsContext.runWithTenantContext(
      tenant.id,
      'system',
      async () => {
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
          `invoice.payment_failed: tenant not found for eid=${eid} — skipping`,
        );
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
