import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { IOrgSubscriptionRepository } from '@qpp/database';
import { randomUUID } from 'crypto';
import type Stripe from 'stripe';

import { BillingService } from '../billing/billing.service';
import { STRIPE_CLIENT } from '../billing/stripe.provider';
import { WebhookHandlerService } from '../billing/webhook-handler.service';
import { FeaturesService } from '../features/features.service';

@Injectable()
export class DevToolsService {
  constructor(
    @Inject('ORG_SUBSCRIPTION_REPOSITORY')
    private readonly orgSubscriptionRepo: IOrgSubscriptionRepository,
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe | null,
    private readonly featuresService: FeaturesService,
    private readonly billingService: BillingService,
    private readonly webhookHandler: WebhookHandlerService,
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
    interval: 'monthly' | 'annual' = 'monthly',
  ) {
    return this.billingService.createCheckoutSession(tenantId, tier, interval);
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
      trialEndsAt: new Date(0),
      currentPeriodEnds: null,
      seatLimit: null,
    });

    return this.featuresService.getTenantFeatures(tenantId);
  }

  async setSubscriptionState(
    tenantId: string,
    state: {
      tier: 'free' | 'pro' | 'enterprise';
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
      currentPeriodEnds: Date | null;
      trialEndsAt: Date | null;
      seatLimit: number | null;
    },
  ) {
    await this.orgSubscriptionRepo.upsert({
      tenantId,
      tier: state.tier,
      stripeCustomerId: state.stripeCustomerId,
      stripeSubscriptionId: state.stripeSubscriptionId,
      currentPeriodEnds: state.currentPeriodEnds,
      trialEndsAt: state.trialEndsAt,
      seatLimit: state.seatLimit,
    });

    return this.featuresService.getTenantFeatures(tenantId);
  }

  async simulateWebhook(
    eventType: string,
    data: Record<string, unknown>,
    eventId?: string,
  ) {
    const event = {
      id: eventId ?? `evt_sim_${randomUUID()}`,
      type: eventType,
      data: { object: data },
    } as unknown as Stripe.Event;

    await this.webhookHandler.process(event);
    return { processed: true, eventId: event.id };
  }
}
