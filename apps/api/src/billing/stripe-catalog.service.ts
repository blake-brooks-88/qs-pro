import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import type Stripe from 'stripe';

import { STRIPE_CLIENT } from './stripe.provider';

const STRIPE_PRICE_DEFINITIONS = {
  pro_monthly: {
    tier: 'pro',
    interval: 'monthly',
    requiredInProduction: true,
  },
  pro_annual: {
    tier: 'pro',
    interval: 'annual',
    requiredInProduction: true,
  },
  enterprise_monthly: {
    tier: 'enterprise',
    interval: 'monthly',
    requiredInProduction: false,
  },
  enterprise_annual: {
    tier: 'enterprise',
    interval: 'annual',
    requiredInProduction: false,
  },
} as const;

export type BillingInterval = 'monthly' | 'annual';
export type PaidTier = 'pro' | 'enterprise';
export type StripePriceLookupKey = keyof typeof STRIPE_PRICE_DEFINITIONS;

type ResolvedStripePrice = {
  id: string;
  lookupKey: StripePriceLookupKey;
  tier: PaidTier;
  interval: BillingInterval;
  unitAmount: number | null;
  recurringInterval: Stripe.Price.Recurring.Interval | null;
};

type StripePriceCatalog = {
  lookupKeyToPrice: Map<StripePriceLookupKey, ResolvedStripePrice>;
  priceIdToPrice: Map<string, ResolvedStripePrice>;
  expiresAt: number;
};

function isLookupKey(value: string): value is StripePriceLookupKey {
  return value in STRIPE_PRICE_DEFINITIONS;
}

@Injectable()
export class StripeCatalogService implements OnModuleInit {
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000;
  private readonly logger = new Logger(StripeCatalogService.name);
  private catalogCache: StripePriceCatalog | null = null;

  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    if (!this.stripe) {
      throw new Error('Stripe must be configured in production');
    }

    await this.assertRequiredPricesConfigured();
  }

  async getPublicPrices(): Promise<{
    monthly: ResolvedStripePrice;
    annual: ResolvedStripePrice;
  }> {
    return {
      monthly: await this.getPriceByLookupKey('pro_monthly'),
      annual: await this.getPriceByLookupKey('pro_annual'),
    };
  }

  async resolveCheckoutPriceId(
    tier: PaidTier,
    interval: BillingInterval,
  ): Promise<string> {
    const lookupKey = `${tier}_${interval}` as StripePriceLookupKey;
    const price = await this.getPriceByLookupKey(lookupKey);
    return price.id;
  }

  async resolveTierFromPrice(price: Stripe.Price): Promise<PaidTier> {
    if (typeof price.lookup_key === 'string' && isLookupKey(price.lookup_key)) {
      return STRIPE_PRICE_DEFINITIONS[price.lookup_key].tier;
    }

    const resolved = await this.getPriceById(price.id);
    return resolved.tier;
  }

  private async assertRequiredPricesConfigured(): Promise<void> {
    const catalog = await this.loadCatalog();

    for (const [lookupKey, definition] of Object.entries(
      STRIPE_PRICE_DEFINITIONS,
    ) as [
      StripePriceLookupKey,
      (typeof STRIPE_PRICE_DEFINITIONS)[StripePriceLookupKey],
    ][]) {
      if (!definition.requiredInProduction) {
        continue;
      }

      if (!catalog.lookupKeyToPrice.has(lookupKey)) {
        throw new Error(
          `Required Stripe price not found for lookup key: ${lookupKey}`,
        );
      }
    }

    this.logger.log('Validated required Stripe price catalog');
  }

  private async getPriceByLookupKey(
    lookupKey: StripePriceLookupKey,
  ): Promise<ResolvedStripePrice> {
    const catalog = await this.loadCatalog();
    const price = catalog.lookupKeyToPrice.get(lookupKey);
    if (!price) {
      throw new ServiceUnavailableException(
        `Price not configured for lookup key: ${lookupKey}`,
      );
    }
    return price;
  }

  private async getPriceById(priceId: string): Promise<ResolvedStripePrice> {
    const catalog = await this.loadCatalog();
    const price = catalog.priceIdToPrice.get(priceId);
    if (!price) {
      throw new Error(
        `Stripe price ${priceId} is not mapped to an application tier`,
      );
    }
    return price;
  }

  private async loadCatalog(): Promise<StripePriceCatalog> {
    if (this.catalogCache && this.catalogCache.expiresAt > Date.now()) {
      return this.catalogCache;
    }

    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }

    const lookupKeys = Object.keys(
      STRIPE_PRICE_DEFINITIONS,
    ) as StripePriceLookupKey[];

    const result = await this.stripe.prices.list({
      lookup_keys: lookupKeys,
      active: true,
      limit: lookupKeys.length,
    });

    const lookupKeyToPrice = new Map<
      StripePriceLookupKey,
      ResolvedStripePrice
    >();
    const priceIdToPrice = new Map<string, ResolvedStripePrice>();

    for (const price of result.data) {
      if (!price.lookup_key || !isLookupKey(price.lookup_key)) {
        continue;
      }

      const definition = STRIPE_PRICE_DEFINITIONS[price.lookup_key];
      const resolved: ResolvedStripePrice = {
        id: price.id,
        lookupKey: price.lookup_key,
        tier: definition.tier,
        interval: definition.interval,
        unitAmount: price.unit_amount,
        recurringInterval: price.recurring?.interval ?? null,
      };

      lookupKeyToPrice.set(price.lookup_key, resolved);
      priceIdToPrice.set(price.id, resolved);
    }

    const catalog = {
      lookupKeyToPrice,
      priceIdToPrice,
      expiresAt: Date.now() + StripeCatalogService.CACHE_TTL_MS,
    };
    this.catalogCache = catalog;
    return catalog;
  }
}
