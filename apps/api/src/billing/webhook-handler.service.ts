import { Inject, Injectable, Logger } from '@nestjs/common';
import { EncryptionService, RlsContextService } from '@qpp/backend-shared';
import type {
  IOrgSubscriptionRepository,
  IStripeBillingBindingRepository,
  IStripeCheckoutSessionRepository,
  IStripeWebhookEventRepository,
  ITenantRepository,
  StripeSubscriptionStatus,
  Tenant,
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

function normalizeSubscriptionStatus(
  status: string | null | undefined,
): StripeSubscriptionStatus {
  switch (status) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'unpaid':
    case 'canceled':
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return status;
    case null:
    case undefined:
    default:
      return 'inactive';
  }
}

@Injectable()
export class WebhookHandlerService {
  private readonly logger = new Logger(WebhookHandlerService.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    @Inject('ORG_SUBSCRIPTION_REPOSITORY')
    private readonly orgSubscriptionRepo: IOrgSubscriptionRepository,
    @Inject('STRIPE_BILLING_BINDING_REPOSITORY')
    private readonly stripeBindingRepo: IStripeBillingBindingRepository,
    @Inject('STRIPE_CHECKOUT_SESSION_REPOSITORY')
    private readonly stripeCheckoutSessionRepo: IStripeCheckoutSessionRepository,
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

  private decryptEidToken(token: string): string {
    try {
      const decrypted = this.encryptionService.decrypt(token);
      if (typeof decrypted === 'string' && decrypted.trim()) {
        return decrypted;
      }
    } catch (error) {
      this.logger.warn(
        `decryptEidToken failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    throw new Error(
      'Invalid metadata.eid token — must be an encrypted token issued by the application',
    );
  }

  private getSubscriptionItem(subscription: Stripe.Subscription) {
    const item = subscription.items.data[0];
    if (!item) {
      throw new Error('Subscription event missing line items');
    }
    return item;
  }

  private getSubscriptionCurrentPeriodEnds(
    subscription: Stripe.Subscription,
  ): Date | null {
    const item = subscription.items.data[0];
    if (!item?.current_period_end) {
      return null;
    }
    return new Date(item.current_period_end * 1000);
  }

  private getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    const sub = invoice.parent?.subscription_details?.subscription;
    if (!sub) {
      return null;
    }
    return typeof sub === 'string' ? sub : sub.id;
  }

  private async resolveTenant(params: {
    encryptedEid?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    eventType: string;
  }): Promise<Tenant | null> {
    if (params.encryptedEid) {
      const eid = this.decryptEidToken(params.encryptedEid);
      const tenant = await this.tenantRepo.findByEid(eid);
      if (!tenant) {
        throw new Error(`Tenant not found for pricing token`);
      }
      return tenant;
    }

    if (params.stripeSubscriptionId) {
      const binding = await this.stripeBindingRepo.findByStripeSubscriptionId(
        params.stripeSubscriptionId,
      );
      if (binding) {
        return (await this.tenantRepo.findById(binding.tenantId)) ?? null;
      }
    }

    if (params.stripeCustomerId) {
      const binding = await this.stripeBindingRepo.findByStripeCustomerId(
        params.stripeCustomerId,
      );
      if (binding) {
        return (await this.tenantRepo.findById(binding.tenantId)) ?? null;
      }
    }

    this.logger.warn(`${params.eventType}: could not resolve tenant`);
    return null;
  }

  private async validateBindingOwnership(
    tenantId: string,
    params: {
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
      eventType: string;
      allowTenantRebind?: boolean;
    },
  ): Promise<boolean> {
    if (params.stripeCustomerId) {
      const customerBinding =
        await this.stripeBindingRepo.findByStripeCustomerId(
          params.stripeCustomerId,
        );
      if (customerBinding && customerBinding.tenantId !== tenantId) {
        await this.auditWebhookConflict(tenantId, {
          reason: 'Incoming Stripe customer is already bound to another tenant',
          eventType: params.eventType,
          incomingStripeCustomerId: params.stripeCustomerId,
          boundTenantId: customerBinding.tenantId,
        });
        return false;
      }
    }

    if (params.stripeSubscriptionId) {
      const subscriptionBinding =
        await this.stripeBindingRepo.findByStripeSubscriptionId(
          params.stripeSubscriptionId,
        );
      if (subscriptionBinding && subscriptionBinding.tenantId !== tenantId) {
        await this.auditWebhookConflict(tenantId, {
          reason:
            'Incoming Stripe subscription is already bound to another tenant',
          eventType: params.eventType,
          incomingStripeSubscriptionId: params.stripeSubscriptionId,
          boundTenantId: subscriptionBinding.tenantId,
        });
        return false;
      }
    }

    if (params.allowTenantRebind) {
      return true;
    }

    const existing = await this.rlsContext.runWithTenantContext(
      tenantId,
      'system',
      () => this.orgSubscriptionRepo.findByTenantId(tenantId),
    );

    if (!existing) {
      return true;
    }

    if (
      params.stripeCustomerId &&
      existing.stripeCustomerId &&
      existing.stripeCustomerId !== params.stripeCustomerId
    ) {
      await this.auditWebhookConflict(tenantId, {
        reason:
          'Incoming Stripe customer does not match the tenant subscription record',
        eventType: params.eventType,
        incomingStripeCustomerId: params.stripeCustomerId,
        existingStripeCustomerId: existing.stripeCustomerId,
        existingStripeSubscriptionId: existing.stripeSubscriptionId,
      });
      return false;
    }

    if (
      params.stripeSubscriptionId &&
      existing.stripeSubscriptionId &&
      existing.stripeSubscriptionId !== params.stripeSubscriptionId
    ) {
      await this.auditWebhookConflict(tenantId, {
        reason:
          'Incoming Stripe subscription does not match the tenant subscription record',
        eventType: params.eventType,
        incomingStripeSubscriptionId: params.stripeSubscriptionId,
        existingStripeSubscriptionId: existing.stripeSubscriptionId,
        existingStripeCustomerId: existing.stripeCustomerId,
      });
      return false;
    }

    return true;
  }

  private async persistBinding(
    tenantId: string,
    stripeCustomerId: string | null,
    stripeSubscriptionId: string | null,
  ): Promise<void> {
    await this.stripeBindingRepo.upsert({
      tenantId,
      stripeCustomerId,
      stripeSubscriptionId,
    });
  }

  private async upsertSubscriptionState(params: {
    tenantId: string;
    tier: PaidTier | 'free';
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    stripeSubscriptionStatus: StripeSubscriptionStatus;
    currentPeriodEnds: Date | null;
    seatLimit: number | null;
    lastInvoicePaidAt?: Date | null;
    trialEndsAt?: Date | null;
  }): Promise<void> {
    await this.rlsContext.runWithIsolatedTenantContext(
      params.tenantId,
      'system',
      async () => {
        const existing = await this.orgSubscriptionRepo.findByTenantId(
          params.tenantId,
        );

        const payload = {
          tier: params.tier,
          stripeCustomerId: params.stripeCustomerId,
          stripeSubscriptionId: params.stripeSubscriptionId,
          stripeSubscriptionStatus: params.stripeSubscriptionStatus,
          currentPeriodEnds: params.currentPeriodEnds,
          seatLimit: params.seatLimit,
          lastInvoicePaidAt:
            params.lastInvoicePaidAt === undefined
              ? (existing?.lastInvoicePaidAt ?? null)
              : params.lastInvoicePaidAt,
          trialEndsAt:
            params.trialEndsAt === undefined
              ? (existing?.trialEndsAt ?? null)
              : params.trialEndsAt,
        };

        if (!existing) {
          await this.orgSubscriptionRepo.upsert({
            tenantId: params.tenantId,
            ...payload,
          });
          return;
        }

        await this.orgSubscriptionRepo.updateFromWebhook(
          params.tenantId,
          payload,
        );
      },
    );
  }

  async process(event: Stripe.Event): Promise<void> {
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
            eventType,
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
        case 'charge.refunded':
          await this.handleChargeRefunded(event.data.object as Stripe.Charge);
          break;
        case 'charge.dispute.created':
          await this.handleChargeDisputeCreated(
            event.data.object as Stripe.Dispute,
          );
          break;
        case 'charge.dispute.closed':
          await this.handleChargeDisputeClosed(
            event.data.object as Stripe.Dispute,
          );
          break;
        case 'checkout.session.expired':
          await this.handleCheckoutSessionExpired(
            event.data.object as Stripe.Checkout.Session,
          );
          break;
        default:
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
    if (session.payment_status !== 'paid') {
      if (session.id) {
        await this.stripeCheckoutSessionRepo.markCompleted(session.id);
      }
      this.logger.warn(
        `checkout.session.completed received without confirmed payment (payment_status=${session.payment_status ?? 'unknown'})`,
      );
      return;
    }

    const stripeCustomerId = getStripeId(session.customer);
    const stripeSubscriptionId = getStripeId(session.subscription);

    if (!stripeCustomerId || !stripeSubscriptionId) {
      throw new Error('Checkout session missing customer or subscription ID');
    }

    if (!this.stripe) {
      throw new Error('Stripe client not configured');
    }

    const subscription =
      await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
    const item = this.getSubscriptionItem(subscription);
    const tier = await this.resolveTierFromProduct(
      item.price.product as string,
    );
    const tenant = await this.resolveTenant({
      encryptedEid: session.metadata?.eid ?? null,
      stripeCustomerId,
      stripeSubscriptionId,
      eventType: 'checkout.session.completed',
    });

    if (!tenant) {
      return;
    }

    const canApply = await this.validateBindingOwnership(tenant.id, {
      stripeCustomerId,
      stripeSubscriptionId,
      eventType: 'checkout.session.completed',
      allowTenantRebind: true,
    });
    if (!canApply) {
      return;
    }

    await this.persistBinding(
      tenant.id,
      stripeCustomerId,
      stripeSubscriptionId,
    );
    await this.upsertSubscriptionState({
      tenantId: tenant.id,
      tier,
      stripeCustomerId,
      stripeSubscriptionId,
      stripeSubscriptionStatus: normalizeSubscriptionStatus(
        subscription.status,
      ),
      currentPeriodEnds: this.getSubscriptionCurrentPeriodEnds(subscription),
      seatLimit: item.quantity ?? null,
      lastInvoicePaidAt: new Date(),
      trialEndsAt: null,
    });

    if (session.id) {
      await this.stripeCheckoutSessionRepo.markCompleted(session.id);
    }
  }

  private async handleSubscriptionChange(
    subscription: Stripe.Subscription,
    eventType:
      | 'customer.subscription.created'
      | 'customer.subscription.updated',
  ): Promise<void> {
    const item = this.getSubscriptionItem(subscription);
    const stripeCustomerId = getStripeId(subscription.customer);
    const stripeSubscriptionId = subscription.id;

    const tenant = await this.resolveTenant({
      encryptedEid: subscription.metadata?.eid ?? null,
      stripeCustomerId,
      stripeSubscriptionId,
      eventType,
    });
    if (!tenant) {
      return;
    }

    const canApply = await this.validateBindingOwnership(tenant.id, {
      stripeCustomerId,
      stripeSubscriptionId,
      eventType,
      allowTenantRebind: eventType === 'customer.subscription.created',
    });
    if (!canApply) {
      return;
    }

    const stripeSubscriptionStatus = normalizeSubscriptionStatus(
      subscription.status,
    );
    const existing = await this.rlsContext.runWithTenantContext(
      tenant.id,
      'system',
      () => this.orgSubscriptionRepo.findByTenantId(tenant.id),
    );
    const resolvedTier = await this.resolveTierFromProduct(
      item.price.product as string,
    );
    const tier =
      (stripeSubscriptionStatus === 'past_due' ||
        stripeSubscriptionStatus === 'unpaid') &&
      existing?.tier &&
      existing.tier !== 'free'
        ? existing.tier
        : resolvedTier;

    await this.persistBinding(
      tenant.id,
      stripeCustomerId,
      stripeSubscriptionId,
    );
    await this.upsertSubscriptionState({
      tenantId: tenant.id,
      tier,
      stripeCustomerId,
      stripeSubscriptionId,
      stripeSubscriptionStatus,
      currentPeriodEnds: this.getSubscriptionCurrentPeriodEnds(subscription),
      seatLimit: item.quantity ?? null,
      trialEndsAt: null,
    });

    await this.auditService.log({
      eventType:
        eventType === 'customer.subscription.created'
          ? 'subscription.created'
          : 'subscription.updated',
      actorType: 'system',
      actorId: null,
      tenantId: tenant.id,
      mid: 'system',
      targetId: tenant.id,
      metadata: {
        tier,
        status: stripeSubscriptionStatus,
        currentPeriodEnds:
          this.getSubscriptionCurrentPeriodEnds(subscription)?.toISOString() ??
          null,
      },
    });
  }

  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const stripeCustomerId = getStripeId(subscription.customer);
    const stripeSubscriptionId = subscription.id;

    const tenant = await this.resolveTenant({
      encryptedEid: subscription.metadata?.eid ?? null,
      stripeCustomerId,
      stripeSubscriptionId,
      eventType: 'customer.subscription.deleted',
    });
    if (!tenant) {
      return;
    }

    const canApply = await this.validateBindingOwnership(tenant.id, {
      stripeCustomerId,
      stripeSubscriptionId,
      eventType: 'customer.subscription.deleted',
    });
    if (!canApply) {
      return;
    }

    await this.stripeBindingRepo.clearSubscription(tenant.id);
    await this.upsertSubscriptionState({
      tenantId: tenant.id,
      tier: 'free',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: 'canceled',
      currentPeriodEnds: null,
      seatLimit: null,
      trialEndsAt: new Date(0),
    });

    await this.auditService.log({
      eventType: 'subscription.canceled',
      actorType: 'system',
      actorId: null,
      tenantId: tenant.id,
      mid: 'system',
      targetId: tenant.id,
    });
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
    const item = this.getSubscriptionItem(subscription);
    const stripeCustomerId = getStripeId(subscription.customer);
    const stripeSubscriptionId = subscription.id;

    const tenant = await this.resolveTenant({
      encryptedEid: subscription.metadata?.eid ?? null,
      stripeCustomerId,
      stripeSubscriptionId,
      eventType: 'invoice.paid',
    });
    if (!tenant) {
      return;
    }

    const canApply = await this.validateBindingOwnership(tenant.id, {
      stripeCustomerId,
      stripeSubscriptionId,
      eventType: 'invoice.paid',
    });
    if (!canApply) {
      return;
    }

    const tier = await this.resolveTierFromProduct(
      item.price.product as string,
    );
    const currentPeriodEnds =
      this.getSubscriptionCurrentPeriodEnds(subscription);

    await this.persistBinding(
      tenant.id,
      stripeCustomerId,
      stripeSubscriptionId,
    );
    await this.upsertSubscriptionState({
      tenantId: tenant.id,
      tier,
      stripeCustomerId,
      stripeSubscriptionId,
      stripeSubscriptionStatus: normalizeSubscriptionStatus(
        subscription.status,
      ),
      currentPeriodEnds,
      seatLimit: item.quantity ?? null,
      lastInvoicePaidAt: new Date(),
      trialEndsAt: null,
    });

    await this.auditService.log({
      eventType: 'subscription.updated',
      actorType: 'system',
      actorId: null,
      tenantId: tenant.id,
      mid: 'system',
      targetId: tenant.id,
      metadata: {
        invoiceId: invoice.id,
        currentPeriodEnds: currentPeriodEnds?.toISOString() ?? null,
      },
    });
  }

  private async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const subscriptionId = this.getInvoiceSubscriptionId(invoice);
    if (!subscriptionId || !this.stripe) {
      return;
    }

    try {
      const subscription =
        await this.stripe.subscriptions.retrieve(subscriptionId);
      const item = this.getSubscriptionItem(subscription);
      const stripeCustomerId = getStripeId(subscription.customer);
      const stripeSubscriptionId = subscription.id;

      const tenant = await this.resolveTenant({
        encryptedEid: subscription.metadata?.eid ?? null,
        stripeCustomerId,
        stripeSubscriptionId,
        eventType: 'invoice.payment_failed',
      });
      if (!tenant) {
        return;
      }

      const canApply = await this.validateBindingOwnership(tenant.id, {
        stripeCustomerId,
        stripeSubscriptionId,
        eventType: 'invoice.payment_failed',
      });
      if (!canApply) {
        return;
      }

      const tier = await this.resolveTierFromProduct(
        item.price.product as string,
      );

      await this.persistBinding(
        tenant.id,
        stripeCustomerId,
        stripeSubscriptionId,
      );
      await this.upsertSubscriptionState({
        tenantId: tenant.id,
        tier,
        stripeCustomerId,
        stripeSubscriptionId,
        stripeSubscriptionStatus: normalizeSubscriptionStatus(
          subscription.status,
        ),
        currentPeriodEnds: this.getSubscriptionCurrentPeriodEnds(subscription),
        seatLimit: item.quantity ?? null,
        trialEndsAt: null,
      });

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
        'invoice.payment_failed: failed to resolve tenant for update',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const stripeCustomerId = getStripeId(charge.customer);
    if (!stripeCustomerId) {
      this.logger.warn('charge.refunded: missing customer — skipping');
      return;
    }

    const binding =
      await this.stripeBindingRepo.findByStripeCustomerId(stripeCustomerId);
    if (!binding) {
      this.logger.warn('charge.refunded: no binding for customer — skipping');
      return;
    }

    await this.auditService.log({
      eventType: 'subscription.refunded',
      actorType: 'system',
      actorId: null,
      tenantId: binding.tenantId,
      mid: 'system',
      targetId: binding.tenantId,
      metadata: {
        chargeId: charge.id,
        amountRefunded: charge.amount_refunded,
      },
    });
  }

  private async resolveCustomerFromDispute(
    dispute: Stripe.Dispute,
  ): Promise<string | null> {
    const chargeId =
      typeof dispute.charge === 'string'
        ? dispute.charge
        : (dispute.charge?.id ?? null);
    if (!chargeId || !this.stripe) {
      return null;
    }
    const charge = await this.stripe.charges.retrieve(chargeId);
    return getStripeId(charge.customer);
  }

  private async handleChargeDisputeCreated(
    dispute: Stripe.Dispute,
  ): Promise<void> {
    const stripeCustomerId = await this.resolveCustomerFromDispute(dispute);
    if (!stripeCustomerId) {
      this.logger.warn(
        'charge.dispute.created: could not resolve customer — skipping',
      );
      return;
    }

    const binding =
      await this.stripeBindingRepo.findByStripeCustomerId(stripeCustomerId);
    if (!binding) {
      this.logger.warn(
        'charge.dispute.created: no binding for customer — skipping',
      );
      return;
    }

    await this.auditService.log({
      eventType: 'subscription.dispute_opened',
      actorType: 'system',
      actorId: null,
      tenantId: binding.tenantId,
      mid: 'system',
      targetId: binding.tenantId,
      metadata: {
        disputeId: dispute.id,
        reason: dispute.reason,
        status: dispute.status,
      },
    });
  }

  private async handleChargeDisputeClosed(
    dispute: Stripe.Dispute,
  ): Promise<void> {
    const stripeCustomerId = await this.resolveCustomerFromDispute(dispute);
    if (!stripeCustomerId) {
      this.logger.warn(
        'charge.dispute.closed: could not resolve customer — skipping',
      );
      return;
    }

    const binding =
      await this.stripeBindingRepo.findByStripeCustomerId(stripeCustomerId);
    if (!binding) {
      this.logger.warn(
        'charge.dispute.closed: no binding for customer — skipping',
      );
      return;
    }

    await this.auditService.log({
      eventType: 'subscription.dispute_closed',
      actorType: 'system',
      actorId: null,
      tenantId: binding.tenantId,
      mid: 'system',
      targetId: binding.tenantId,
      metadata: {
        disputeId: dispute.id,
        reason: dispute.reason,
        status: dispute.status,
      },
    });
  }

  private async handleCheckoutSessionExpired(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    if (session.id) {
      await this.stripeCheckoutSessionRepo.markExpired(session.id);
    }

    const stripeCustomerId = getStripeId(session.customer);
    const stripeSubscriptionId = getStripeId(session.subscription);

    const tenant = await this.resolveTenant({
      encryptedEid: session.metadata?.eid ?? null,
      stripeCustomerId,
      stripeSubscriptionId,
      eventType: 'checkout.session.expired',
    });
    if (!tenant) {
      return;
    }

    await this.auditService.log({
      eventType: 'checkout.expired',
      actorType: 'system',
      actorId: null,
      tenantId: tenant.id,
      mid: 'system',
      targetId: tenant.id,
      metadata: {},
    });
  }

  private async resolveTierFromProduct(productId: string): Promise<PaidTier> {
    if (!this.stripe) {
      throw new Error('Stripe client not configured');
    }
    const product = await this.stripe.products.retrieve(productId);
    const tier = product.metadata?.tier;
    if (!isValidPaidTier(tier)) {
      throw new Error(
        `Stripe product ${productId} missing valid metadata.tier (got: ${tier})`,
      );
    }
    return tier;
  }
}
