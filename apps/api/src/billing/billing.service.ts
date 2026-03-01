import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '@qpp/backend-shared';
import type {
  IOrgSubscriptionRepository,
  ITenantRepository,
} from '@qpp/database';
import type Stripe from 'stripe';

import { STRIPE_CLIENT } from './stripe.provider';

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
    private readonly encryptionService: EncryptionService,
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

    const lookupKey = PRICE_LOOKUP_KEYS[
      `${tier}_${interval}`
    ] as PriceLookupKey;
    const priceId = await this.resolvePriceId(lookupKey);

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const eid = this.encryptionService.encrypt(tenant.eid);
    if (!eid) {
      throw new BadRequestException('Failed to encrypt tenant identifier');
    }

    const base = new URL(
      this.configService.getOrThrow<string>('APP_WEB_ORIGIN'),
    );
    const successUrl = new URL('?checkout=success', base).toString();
    const cancelUrl = new URL('?checkout=cancel', base).toString();

    const session = await this.stripe.checkout.sessions.create({
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
          label: { type: 'custom' as const, custom: 'Purchase Order Number' },
          type: 'text' as const,
          optional: true,
        },
      ],
    });

    if (!session.url) {
      throw new BadRequestException('Stripe checkout session missing URL');
    }

    return { url: session.url };
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
