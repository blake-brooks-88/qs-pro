import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EncryptionService,
  getReservedSqlFromContext,
  RlsContextService,
} from '@qpp/backend-shared';
import type {
  IOrgSubscriptionRepository,
  IStripeCheckoutSessionRepository,
  ITenantRepository,
} from '@qpp/database';
import type Stripe from 'stripe';

import { STRIPE_CLIENT } from './stripe.provider';
import { hasPaidEntitlement } from './subscription-entitlements';
import { WebhookHandlerService } from './webhook-handler.service';

const PRICE_LOOKUP_KEYS = {
  pro_monthly: 'pro_monthly',
  pro_annual: 'pro_annual',
  enterprise_monthly: 'enterprise_monthly',
  enterprise_annual: 'enterprise_annual',
} as const;

type PriceLookupKey =
  (typeof PRICE_LOOKUP_KEYS)[keyof typeof PRICE_LOOKUP_KEYS];

export interface PricesResponse {
  pro: { monthly: number; annual: number };
}

export interface CheckoutConfirmationResponse {
  status: 'fulfilled' | 'pending' | 'failed';
  reason?: 'expired' | 'unpaid';
}

@Injectable()
export class BillingService {
  private readonly priceCache = new Map<
    string,
    { priceId: string; expiresAt: number }
  >();
  private pricesResponseCache: {
    data: PricesResponse;
    expiresAt: number;
  } | null = null;
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000;

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly configService: ConfigService,
    @Inject('TENANT_REPOSITORY') private readonly tenantRepo: ITenantRepository,
    @Inject('ORG_SUBSCRIPTION_REPOSITORY')
    private readonly orgSubscriptionRepo: IOrgSubscriptionRepository,
    @Inject('STRIPE_CHECKOUT_SESSION_REPOSITORY')
    private readonly stripeCheckoutSessionRepo: IStripeCheckoutSessionRepository,
    private readonly encryptionService: EncryptionService,
    private readonly rlsContext: RlsContextService,
    private readonly webhookHandler: WebhookHandlerService,
  ) {}

  async getPrices(): Promise<PricesResponse> {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }

    if (
      this.pricesResponseCache &&
      this.pricesResponseCache.expiresAt > Date.now()
    ) {
      return this.pricesResponseCache.data;
    }

    const result = await this.stripe.prices.list({
      lookup_keys: ['pro_monthly', 'pro_annual'],
      active: true,
    });

    const pricesByKey = new Map<string, Stripe.Price>();
    for (const price of result.data) {
      if (price.lookup_key) {
        pricesByKey.set(price.lookup_key, price);
      }
    }

    const monthlyPrice = pricesByKey.get('pro_monthly');
    const annualPrice = pricesByKey.get('pro_annual');

    if (!monthlyPrice?.unit_amount || !annualPrice?.unit_amount) {
      throw new ServiceUnavailableException(
        'Required Pro prices not found in Stripe',
      );
    }

    const monthlyDollars = monthlyPrice.unit_amount / 100;
    let annualDollars = annualPrice.unit_amount / 100;

    // Normalize yearly price to monthly equivalent
    if (annualPrice.recurring?.interval === 'year') {
      annualDollars = annualDollars / 12;
    }

    annualDollars = Math.round(annualDollars * 100) / 100;

    const data: PricesResponse = {
      pro: { monthly: monthlyDollars, annual: annualDollars },
    };

    this.pricesResponseCache = {
      data,
      expiresAt: Date.now() + BillingService.CACHE_TTL_MS,
    };

    return data;
  }

  async createCheckoutSession(
    tenantId: string,
    tier: 'pro' | 'enterprise',
    interval: 'monthly' | 'annual',
  ): Promise<{ url: string }> {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }
    const stripe = this.stripe;

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const existingSubscription = await this.rlsContext.runWithTenantContext(
      tenantId,
      'system',
      () => this.orgSubscriptionRepo.findByTenantId(tenantId),
    );
    if (hasPaidEntitlement(existingSubscription)) {
      throw new BadRequestException(
        'An active paid subscription already exists for this tenant',
      );
    }

    // Pre-check: reconcile any stale completed checkout before entering
    // the locked transaction. This ensures reconciliation commits independently
    // so it isn't rolled back by subsequent errors within the checkout transaction.
    const staleSession = await this.rlsContext.runWithTenantContext(
      tenantId,
      'system',
      async () => {
        const existingCheckout =
          await this.stripeCheckoutSessionRepo.findByTenantId(tenantId);
        if (
          existingCheckout?.status === 'open' &&
          existingCheckout.tier === tier &&
          existingCheckout.interval === interval &&
          existingCheckout.sessionId
        ) {
          const liveSession = await stripe.checkout.sessions.retrieve(
            existingCheckout.sessionId,
          );
          await this.syncStoredCheckoutSession(liveSession);
          if (
            liveSession.status === 'complete' &&
            liveSession.payment_status === 'paid'
          ) {
            return liveSession;
          }
        }
        return null;
      },
    );

    if (staleSession) {
      await this.processCheckoutCompletion(staleSession);

      const reconciledSubscription = await this.rlsContext.runWithTenantContext(
        tenantId,
        'system',
        () => this.orgSubscriptionRepo.findByTenantId(tenantId),
      );
      if (hasPaidEntitlement(reconciledSubscription)) {
        throw new BadRequestException(
          'An active paid subscription already exists for this tenant',
        );
      }
    }

    return this.rlsContext.runWithIsolatedTenantContext(
      tenantId,
      'system',
      async () => {
        const reservedSql = getReservedSqlFromContext();
        if (!reservedSql) {
          throw new Error('Missing reserved SQL context for checkout creation');
        }

        await reservedSql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;

        const lockedSubscription =
          await this.orgSubscriptionRepo.findByTenantId(tenantId);
        if (hasPaidEntitlement(lockedSubscription)) {
          throw new BadRequestException(
            'An active paid subscription already exists for this tenant',
          );
        }

        const existingCheckout =
          await this.stripeCheckoutSessionRepo.findByTenantId(tenantId);
        const now = new Date();

        if (
          existingCheckout?.status === 'open' &&
          existingCheckout.tier === tier &&
          existingCheckout.interval === interval &&
          existingCheckout.sessionId
        ) {
          const liveSession = await stripe.checkout.sessions.retrieve(
            existingCheckout.sessionId,
          );

          await this.syncStoredCheckoutSession(liveSession);

          const liveExpiresAt = liveSession.expires_at
            ? new Date(liveSession.expires_at * 1000)
            : existingCheckout.expiresAt;

          if (
            liveSession.status === 'open' &&
            liveExpiresAt !== null &&
            liveExpiresAt > now &&
            existingCheckout.sessionUrl
          ) {
            return { url: existingCheckout.sessionUrl };
          }
        }

        const idempotencyKey =
          existingCheckout?.tier === tier &&
          existingCheckout.interval === interval &&
          (existingCheckout.status === 'creating' ||
            existingCheckout.status === 'failed')
            ? existingCheckout.idempotencyKey
            : `checkout:${tenantId}:${randomUUID()}`;

        await this.stripeCheckoutSessionRepo.upsert({
          tenantId,
          idempotencyKey,
          sessionId: null,
          sessionUrl: null,
          tier,
          interval,
          status: 'creating',
          expiresAt: null,
          lastError: null,
        });

        try {
          const lookupKey = PRICE_LOOKUP_KEYS[
            `${tier}_${interval}`
          ] as PriceLookupKey;
          const priceId = await this.resolvePriceId(lookupKey);

          const eid = this.encryptionService.encrypt(tenant.eid);
          if (!eid) {
            throw new BadRequestException(
              'Failed to encrypt tenant identifier',
            );
          }

          const base = new URL(
            this.configService.getOrThrow<string>('APP_WEB_ORIGIN'),
          );
          const successUrl = new URL(
            '?checkout=success&session_id={CHECKOUT_SESSION_ID}',
            base,
          ).toString();
          const cancelUrl = new URL('?checkout=cancel', base).toString();

          const session = await stripe.checkout.sessions.create(
            {
              mode: 'subscription',
              line_items: [{ price: priceId, quantity: 1 }],
              metadata: { eid, tier },
              subscription_data: { metadata: { eid, tier } },
              success_url: successUrl,
              cancel_url: cancelUrl,
              allow_promotion_codes: true,
              custom_fields: [
                {
                  key: 'purchase_order',
                  label: {
                    type: 'custom' as const,
                    custom: 'Purchase Order Number',
                  },
                  type: 'text' as const,
                  optional: true,
                },
              ],
            },
            { idempotencyKey },
          );

          if (!session.url || !session.id || !session.expires_at) {
            throw new BadRequestException(
              'Stripe checkout session missing required fields',
            );
          }

          await this.stripeCheckoutSessionRepo.upsert({
            tenantId,
            idempotencyKey,
            sessionId: session.id,
            sessionUrl: session.url,
            tier,
            interval,
            status: 'open',
            expiresAt: new Date(session.expires_at * 1000),
            lastError: null,
          });

          return { url: session.url };
        } catch (error) {
          await this.stripeCheckoutSessionRepo.markFailed(
            tenantId,
            error instanceof Error ? error.message : String(error),
          );
          throw error;
        }
      },
    );
  }

  async createPortalSession(tenantId: string): Promise<{ url: string }> {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }

    const subscription =
      await this.orgSubscriptionRepo.findByTenantId(tenantId);
    if (!subscription?.stripeCustomerId) {
      throw new BadRequestException('No active subscription found');
    }

    const portalReturnUrl = new URL(
      this.configService.getOrThrow<string>('APP_WEB_ORIGIN'),
    ).toString();

    const session = await this.stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: portalReturnUrl,
    });

    return { url: session.url };
  }

  async confirmCheckoutSession(
    tenantId: string,
    sessionId: string,
  ): Promise<CheckoutConfirmationResponse> {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    const encryptedEid = session.metadata?.eid;

    if (!encryptedEid) {
      throw new BadRequestException(
        'Checkout session is missing tenant metadata',
      );
    }

    const eid = this.encryptionService.decrypt(encryptedEid);
    if (eid !== tenant.eid) {
      throw new BadRequestException(
        'Checkout session does not belong to this tenant',
      );
    }

    await this.syncStoredCheckoutSession(session);

    if (session.status === 'complete') {
      if (session.payment_status === 'paid') {
        await this.processCheckoutCompletion(session);
        return { status: 'fulfilled' };
      }

      return { status: 'failed', reason: 'unpaid' };
    }

    if (
      session.status === 'expired' ||
      (session.expires_at !== null &&
        session.expires_at !== undefined &&
        session.expires_at * 1000 <= Date.now())
    ) {
      return { status: 'failed', reason: 'expired' };
    }

    return { status: 'pending' };
  }

  private async syncStoredCheckoutSession(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    if (!session.id) {
      return;
    }

    if (session.status === 'complete') {
      await this.stripeCheckoutSessionRepo.markCompleted(session.id);
      return;
    }

    if (session.status === 'expired') {
      await this.stripeCheckoutSessionRepo.markExpired(session.id);
    }
  }

  private async processCheckoutCompletion(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    await this.webhookHandler.process({
      id: `evt_reconcile_checkout_${session.id}`,
      created:
        typeof session.created === 'number'
          ? session.created
          : Math.floor(Date.now() / 1000),
      type: 'checkout.session.completed',
      data: {
        object: session,
      },
    } as unknown as Stripe.Event);
  }

  private async resolvePriceId(lookupKey: string): Promise<string> {
    const cached = this.priceCache.get(lookupKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.priceId;
    }

    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }

    const prices = await this.stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
      limit: 1,
    });

    const price = prices.data[0];
    if (!price) {
      throw new BadRequestException(
        `Price not configured for lookup key: ${lookupKey}`,
      );
    }

    const priceId = price.id;
    this.priceCache.set(lookupKey, {
      priceId,
      expiresAt: Date.now() + BillingService.CACHE_TTL_MS,
    });

    return priceId;
  }
}
