import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '@qpp/backend-shared';
import type {
  IOrgSubscriptionRepository,
  ITenantRepository,
} from '@qpp/database';
import type Stripe from 'stripe';

import { STRIPE_CLIENT } from '../billing/stripe.provider';
import { FeaturesService } from '../features/features.service';

@Injectable()
export class DevToolsService {
  constructor(
    @Inject('ORG_SUBSCRIPTION_REPOSITORY')
    private readonly orgSubscriptionRepo: IOrgSubscriptionRepository,
    @Inject('TENANT_REPOSITORY')
    private readonly tenantRepo: ITenantRepository,
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe | null,
    private readonly configService: ConfigService,
    private readonly featuresService: FeaturesService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async setTrialDays(tenantId: string, days: number | null) {
    if (days !== null) {
      await this.orgSubscriptionRepo.upsert({
        tenantId,
        tier: 'pro',
        trialEndsAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        currentPeriodEnds: null,
        seatLimit: null,
      });
    } else {
      await this.orgSubscriptionRepo.updateFromWebhook(tenantId, {
        trialEndsAt: null,
      });
    }

    return this.featuresService.getTenantFeatures(tenantId);
  }

  async createCheckout(
    tenantId: string,
    tier: 'pro' | 'enterprise',
    returnUrl: string,
  ) {
    if (!this.stripe) {
      throw new InternalServerErrorException('Stripe is not configured');
    }

    const priceId = this.configService.get<string>(
      tier === 'pro' ? 'STRIPE_PRO_PRICE_ID' : 'STRIPE_ENTERPRISE_PRICE_ID',
    );

    if (!priceId) {
      throw new InternalServerErrorException(
        `Price ID not configured for tier: ${tier}`,
      );
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const token = this.encryptionService.encrypt(tenant.eid);
    if (!token) {
      throw new InternalServerErrorException(
        'Failed to generate encrypted tenant token',
      );
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { eid: token, tier },
      subscription_data: { metadata: { eid: token, tier } },
      success_url: `${returnUrl}?checkout=success`,
      cancel_url: `${returnUrl}?checkout=cancel`,
    });

    if (!session.url) {
      throw new InternalServerErrorException(
        'Stripe checkout session missing URL',
      );
    }

    return { url: session.url };
  }

  async cancelSubscription(tenantId: string) {
    if (!this.stripe) {
      throw new InternalServerErrorException('Stripe is not configured');
    }

    const subscription =
      await this.orgSubscriptionRepo.findByTenantId(tenantId);
    if (!subscription) {
      throw new BadRequestException('No subscription found');
    }

    if (!subscription.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription');
    }

    await this.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);

    return { canceled: true };
  }

  async resetToFree(tenantId: string) {
    await this.orgSubscriptionRepo.upsert({
      tenantId,
      tier: 'free',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: null,
      currentPeriodEnds: null,
      seatLimit: null,
    });

    return this.featuresService.getTenantFeatures(tenantId);
  }
}
