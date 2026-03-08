import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import type Stripe from 'stripe';

import { STRIPE_CLIENT } from './stripe.provider.js';

const STRIPE_PRICE_DEFINITIONS = {
  pro_monthly: { tier: 'pro', interval: 'monthly' },
  pro_annual: { tier: 'pro', interval: 'annual' },
  enterprise_monthly: { tier: 'enterprise', interval: 'monthly' },
  enterprise_annual: { tier: 'enterprise', interval: 'annual' },
} as const;

export type BillingInterval = 'monthly' | 'annual';
export type PaidTier = 'pro' | 'enterprise';
export type StripePriceLookupKey = keyof typeof STRIPE_PRICE_DEFINITIONS;

interface ResolvedPrice {
  id: string;
  lookupKey: StripePriceLookupKey;
}

@Injectable()
export class StripeCatalogService implements OnModuleInit {
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000;
  private readonly logger = new Logger(StripeCatalogService.name);
  private cache: Map<StripePriceLookupKey, ResolvedPrice> | null = null;
  private cacheExpiresAt = 0;

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV !== 'production' || !this.stripe) {
      return;
    }
    await this.loadCatalog();
    this.logger.log('Stripe price catalog loaded');
  }

  async resolveCheckoutPriceId(
    tier: PaidTier,
    interval: BillingInterval,
  ): Promise<string> {
    const lookupKey = `${tier}_${interval}` as StripePriceLookupKey;
    const catalog = await this.loadCatalog();
    const price = catalog.get(lookupKey);
    if (!price) {
      throw new ServiceUnavailableException(
        `Price not configured for ${tier} ${interval}`,
      );
    }
    return price.id;
  }

  private async loadCatalog(): Promise<Map<StripePriceLookupKey, ResolvedPrice>> {
    if (this.cache && this.cacheExpiresAt > Date.now()) {
      return this.cache;
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
      limit: 100,
    });

    const map = new Map<StripePriceLookupKey, ResolvedPrice>();
    for (const price of result.data) {
      if (
        price.lookup_key &&
        price.lookup_key in STRIPE_PRICE_DEFINITIONS
      ) {
        map.set(price.lookup_key as StripePriceLookupKey, {
          id: price.id,
          lookupKey: price.lookup_key as StripePriceLookupKey,
        });
      }
    }

    this.cache = map;
    this.cacheExpiresAt = Date.now() + StripeCatalogService.CACHE_TTL_MS;
    return map;
  }
}
