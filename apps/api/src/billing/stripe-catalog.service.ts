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

function expectedStripeInterval(
  interval: BillingInterval,
): Stripe.Price.Recurring.Interval {
  return interval === 'monthly' ? 'month' : 'year';
}

function getPriceDefinition(lookupKey: StripePriceLookupKey) {
  switch (lookupKey) {
    case 'pro_monthly':
      return STRIPE_PRICE_DEFINITIONS.pro_monthly;
    case 'pro_annual':
      return STRIPE_PRICE_DEFINITIONS.pro_annual;
    case 'enterprise_monthly':
      return STRIPE_PRICE_DEFINITIONS.enterprise_monthly;
    case 'enterprise_annual':
      return STRIPE_PRICE_DEFINITIONS.enterprise_annual;
  }
}

function getLookupKey(
  tier: PaidTier,
  interval: BillingInterval,
): StripePriceLookupKey {
  if (tier === 'pro') {
    return interval === 'monthly' ? 'pro_monthly' : 'pro_annual';
  }

  return interval === 'monthly' ? 'enterprise_monthly' : 'enterprise_annual';
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
    const lookupKey = getLookupKey(tier, interval);
    const price = await this.getPriceByLookupKey(lookupKey);
    return price.id;
  }

  async resolveTierFromPrice(price: Stripe.Price): Promise<PaidTier> {
    if (typeof price.lookup_key === 'string' && isLookupKey(price.lookup_key)) {
      return this.validateResolvedPrice(
        this.toResolvedPrice(price.id, price.lookup_key, price),
      ).tier;
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

      const price = catalog.lookupKeyToPrice.get(lookupKey);
      if (!price) {
        throw new Error(
          `Required Stripe price not found for lookup key: ${lookupKey}`,
        );
      }

      this.validateResolvedPrice(price);
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
    return this.validateResolvedPrice(price);
  }

  private async getPriceById(priceId: string): Promise<ResolvedStripePrice> {
    const catalog = await this.loadCatalog();
    const price = catalog.priceIdToPrice.get(priceId);
    if (price) {
      return this.validateResolvedPrice(price);
    }

    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }

    const retrieved = await this.stripe.prices.retrieve(priceId);
    if ('deleted' in retrieved && retrieved.deleted) {
      throw new Error(`Stripe price ${priceId} no longer exists`);
    }

    if (!retrieved.lookup_key || !isLookupKey(retrieved.lookup_key)) {
      throw new Error(
        `Stripe price ${priceId} is not mapped to an application tier`,
      );
    }

    const resolved = this.validateResolvedPrice(
      this.toResolvedPrice(retrieved.id, retrieved.lookup_key, retrieved),
    );
    catalog.priceIdToPrice.set(priceId, resolved);
    return resolved;
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
      // Stripe list endpoints cap at 100; use a high limit to avoid partial results
      // if the account accidentally has multiple active prices for the same lookup_key.
      limit: 100,
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

      const resolved = this.toResolvedPrice(price.id, price.lookup_key, price);

      if (lookupKeyToPrice.has(price.lookup_key)) {
        const existing = lookupKeyToPrice.get(price.lookup_key);
        throw new Error(
          `Multiple active Stripe prices found for lookup key ${price.lookup_key}: ${existing?.id ?? 'unknown'} and ${price.id}`,
        );
      }

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

  private toResolvedPrice(
    id: string,
    lookupKey: StripePriceLookupKey,
    price: Pick<Stripe.Price, 'unit_amount' | 'recurring'>,
  ): ResolvedStripePrice {
    const definition = getPriceDefinition(lookupKey);
    return {
      id,
      lookupKey,
      tier: definition.tier,
      interval: definition.interval,
      unitAmount: price.unit_amount,
      recurringInterval: price.recurring?.interval ?? null,
    };
  }

  private validateResolvedPrice(
    price: ResolvedStripePrice,
  ): ResolvedStripePrice {
    const expectedInterval = expectedStripeInterval(price.interval);
    if (price.recurringInterval !== expectedInterval) {
      throw new Error(
        `Stripe price ${price.id} for lookup key ${price.lookupKey} must recur ${expectedInterval}, got ${price.recurringInterval ?? 'none'}`,
      );
    }

    return price;
  }
}
