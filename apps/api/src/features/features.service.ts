import { Inject, Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '@qpp/backend-shared';
import type {
  IFeatureOverrideRepository,
  ITenantRepository,
} from '@qpp/database';
import type { FeatureKey, TenantFeaturesResponse } from '@qpp/shared-types';
import { ALL_FEATURE_KEYS, getTierFeatures } from '@qpp/shared-types';

@Injectable()
export class FeaturesService {
  constructor(
    @Inject('FEATURE_OVERRIDE_REPOSITORY')
    private featureOverrideRepo: IFeatureOverrideRepository,
    @Inject('TENANT_REPOSITORY')
    private tenantRepo: ITenantRepository,
  ) {}

  /**
   * Gets the effective features for a tenant, including tier-based features and overrides
   */
  async getTenantFeatures(tenantId: string): Promise<TenantFeaturesResponse> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        operation: 'getTenantFeatures',
      });
    }

    if (!tenant.subscriptionTier) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
        reason: 'Tenant subscription tier not set',
      });
    }

    const tier = tenant.subscriptionTier;

    // Start with base tier features
    const features = getTierFeatures(tier);

    // Apply overrides
    const overrides = await this.featureOverrideRepo.findByTenantId(tenantId);

    for (const override of overrides) {
      const key = override.featureKey as FeatureKey;
      if (ALL_FEATURE_KEYS.includes(key)) {
        // eslint-disable-next-line security/detect-object-injection -- `key` is validated against ALL_FEATURE_KEYS allowlist
        features[key] = override.enabled;
      }
    }

    return { tier, features };
  }
}
