import { getTierFeatures } from '@qpp/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeaturesService } from '../features.service';

describe('FeaturesService', () => {
  let featureOverrideRepo: { findByTenantId: ReturnType<typeof vi.fn> };
  let tenantRepo: { findById: ReturnType<typeof vi.fn> };
  let orgSubscriptionRepo: { findByTenantId: ReturnType<typeof vi.fn> };
  let trialService: { getTrialState: ReturnType<typeof vi.fn> };
  let rlsContext: { runWithTenantContext: ReturnType<typeof vi.fn> };
  let service: FeaturesService;

  beforeEach(() => {
    featureOverrideRepo = {
      findByTenantId: vi.fn().mockResolvedValue([]),
    };
    tenantRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'tenant-1',
        eid: 'eid-1',
        tssd: 'test-tssd',
      }),
    };
    orgSubscriptionRepo = {
      findByTenantId: vi.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        tier: 'pro',
        stripeSubscriptionId: 'sub_1',
        stripeSubscriptionStatus: 'active',
        currentPeriodEnds: new Date('2026-04-01T00:00:00.000Z'),
        lastInvoicePaidAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
    };
    trialService = {
      getTrialState: vi.fn().mockResolvedValue({ isActive: false }),
    };
    rlsContext = {
      runWithTenantContext: vi.fn().mockImplementation((_tenantId, _mid, fn) => fn()),
    };

    service = new FeaturesService(
      featureOverrideRepo as never,
      tenantRepo as never,
      orgSubscriptionRepo as never,
      trialService as never,
      rlsContext as never,
    );
  });

  it('returns resolved tier features with overrides and current period end', async () => {
    featureOverrideRepo.findByTenantId.mockResolvedValue([
      { featureKey: 'deployToAutomation', enabled: false },
      { featureKey: 'unknown-feature', enabled: true },
    ]);

    const result = await service.getTenantFeatures('tenant-1');

    expect(result.tier).toBe('pro');
    expect(result.features.advancedAutocomplete).toBe(
      getTierFeatures('pro').advancedAutocomplete,
    );
    expect(result.features.deployToAutomation).toBe(false);
    expect(result.currentPeriodEnds).toBe('2026-04-01T00:00:00.000Z');
    expect(trialService.getTrialState).toHaveBeenCalledWith('tenant-1');
  });

  it('throws RESOURCE_NOT_FOUND when the tenant does not exist', async () => {
    tenantRepo.findById.mockResolvedValue(undefined);

    await expect(service.getTenantFeatures('missing-tenant')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      context: { operation: 'getTenantFeatures' },
    });
  });

  it('returns a free tier when the subscription has expired', async () => {
    orgSubscriptionRepo.findByTenantId.mockResolvedValue({
      tenantId: 'tenant-1',
      tier: 'pro',
      stripeSubscriptionId: 'sub_1',
      stripeSubscriptionStatus: 'active',
      currentPeriodEnds: new Date('2026-03-01T00:00:00.000Z'),
      lastInvoicePaidAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    const result = await service.getTenantFeatures('tenant-1');

    expect(result.tier).toBe('free');
    expect(result.currentPeriodEnds).toBe('2026-03-01T00:00:00.000Z');
  });
});
