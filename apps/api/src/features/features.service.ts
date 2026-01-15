import {
  Injectable,
  Inject,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import type {
  IFeatureOverrideRepository,
  ITenantRepository,
} from '@qs-pro/database';
import { getTierFeatures, ALL_FEATURE_KEYS } from '@qs-pro/shared-types';
import type { TenantFeatures, FeatureKey } from '@qs-pro/shared-types';

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
  async getTenantFeatures(tenantId: string): Promise<TenantFeatures> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (!tenant.subscriptionTier) {
      throw new InternalServerErrorException(
        'Tenant subscription tier not set',
      );
    }

    // Start with base tier features
    const features = getTierFeatures(tenant.subscriptionTier);

    // Apply overrides
    const overrides = await this.featureOverrideRepo.findByTenantId(tenantId);

    for (const override of overrides) {
      const key = override.featureKey as FeatureKey;
      if (ALL_FEATURE_KEYS.includes(key)) {
        features[key] = override.enabled;
      }
    }

    return features;
  }
}
