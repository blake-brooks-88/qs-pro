import { Inject, Injectable } from '@nestjs/common';
import { AppError, ErrorCode, RlsContextService } from '@qpp/backend-shared';
import type {
  IFeatureOverrideRepository,
  IOrgSubscriptionRepository,
  ITenantRepository,
} from '@qpp/database';
import type {
  FeatureKey,
  SubscriptionTier,
  TenantFeaturesResponse,
} from '@qpp/shared-types';
import { ALL_FEATURE_KEYS, getTierFeatures } from '@qpp/shared-types';

import { TrialService } from '../trial/trial.service';

function hasActivePaidSubscription(
  subscription: {
    stripeSubscriptionId: string | null;
    currentPeriodEnds: Date | null;
    tier: SubscriptionTier;
  },
  now: Date,
): boolean {
  return (
    Boolean(subscription.stripeSubscriptionId) &&
    subscription.tier !== 'free' &&
    Boolean(subscription.currentPeriodEnds) &&
    subscription.currentPeriodEnds!.getTime() > now.getTime()
  );
}

@Injectable()
export class FeaturesService {
  constructor(
    @Inject('FEATURE_OVERRIDE_REPOSITORY')
    private featureOverrideRepo: IFeatureOverrideRepository,
    @Inject('TENANT_REPOSITORY')
    private tenantRepo: ITenantRepository,
    @Inject('ORG_SUBSCRIPTION_REPOSITORY')
    private orgSubscriptionRepo: IOrgSubscriptionRepository,
    private readonly trialService: TrialService,
    private readonly rlsContext: RlsContextService,
  ) {}

  async getTenantFeatures(tenantId: string): Promise<TenantFeaturesResponse> {
    return this.rlsContext.runWithTenantContext(tenantId, '', async () => {
      const tenant = await this.tenantRepo.findById(tenantId);
      if (!tenant) {
        throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
          operation: 'getTenantFeatures',
        });
      }

      const subscription =
        await this.orgSubscriptionRepo.findByTenantId(tenantId);
      const now = new Date();

      let effectiveTier: SubscriptionTier;
      if (subscription) {
        if (hasActivePaidSubscription(subscription, now)) {
          effectiveTier = subscription.tier;
        } else if (
          subscription.trialEndsAt &&
          new Date(subscription.trialEndsAt) > now
        ) {
          effectiveTier = subscription.tier;
        } else {
          effectiveTier = 'free';
        }
      } else {
        effectiveTier = 'free';
      }

      const features = getTierFeatures(effectiveTier);

      const overrides = await this.featureOverrideRepo.findByTenantId(tenantId);

      for (const override of overrides) {
        const key = override.featureKey as FeatureKey;
        if (ALL_FEATURE_KEYS.includes(key)) {
          // eslint-disable-next-line security/detect-object-injection -- `key` is validated against ALL_FEATURE_KEYS allowlist
          features[key] = override.enabled;
        }
      }

      const trial = await this.trialService.getTrialState(tenantId);

      return {
        tier: effectiveTier,
        features,
        trial,
        currentPeriodEnds: subscription?.currentPeriodEnds?.toISOString() ?? null,
      };
    });
  }

  async updateTier(
    tenantId: string,
    tier: SubscriptionTier,
  ): Promise<TenantFeaturesResponse> {
    await this.orgSubscriptionRepo.updateTierByTenantId(tenantId, tier);
    return this.getTenantFeatures(tenantId);
  }
}
