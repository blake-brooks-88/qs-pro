import { Test, TestingModule } from '@nestjs/testing';
import { RlsContextService } from '@qpp/backend-shared';
import type {
  IFeatureOverrideRepository,
  IOrgSubscriptionRepository,
  ITenantRepository,
  OrgSubscription,
  TenantFeatureOverride,
} from '@qpp/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrialService } from '../../trial/trial.service';
import { FeaturesService } from '../features.service';

function createMockRlsContextService() {
  type RunWithTenantContext = RlsContextService['runWithTenantContext'];

  const runWithTenantContext = vi.fn(
    async <T>(_tenantId: string, _mid: string, fn: () => Promise<T>) => fn(),
  ) as unknown as RunWithTenantContext;

  return { runWithTenantContext };
}

function createMockOrgSubscriptionRepo() {
  return {
    findByTenantId: vi.fn(),
    findByStripeCustomerId: vi.fn(),
    upsert: vi.fn(),
    insertIfNotExists: vi.fn(),
    startTrialIfEligible: vi.fn(),
    updateTierByTenantId: vi.fn(),
    updateFromWebhook: vi.fn(),
  } satisfies Record<
    keyof IOrgSubscriptionRepository,
    ReturnType<typeof vi.fn>
  >;
}

function createMockTrialService() {
  return {
    activateTrial: vi.fn().mockResolvedValue(undefined),
    getTrialState: vi.fn().mockResolvedValue(null),
  };
}

const baseTenant = {
  id: 'tenant-1',
  eid: 'eid-1',
  tssd: 'test-tssd',
  auditRetentionDays: 365,
  installedAt: new Date(),
};

const baseSubscription: OrgSubscription = {
  id: 'sub-1',
  tenantId: 'tenant-1',
  tier: 'pro',
  trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  stripeSubscriptionId: null,
  stripeCustomerId: null,
  seatLimit: null,
  currentPeriodEnds: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('FeaturesService', () => {
  let service: FeaturesService;
  let featureOverrideRepo: IFeatureOverrideRepository;
  let tenantRepo: ITenantRepository;
  let orgSubscriptionRepo: ReturnType<typeof createMockOrgSubscriptionRepo>;
  let trialService: ReturnType<typeof createMockTrialService>;

  beforeEach(async () => {
    orgSubscriptionRepo = createMockOrgSubscriptionRepo();
    trialService = createMockTrialService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeaturesService,
        {
          provide: 'FEATURE_OVERRIDE_REPOSITORY',
          useValue: {
            findByTenantId: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: 'TENANT_REPOSITORY',
          useValue: {
            findById: vi.fn().mockResolvedValue({ ...baseTenant }),
          },
        },
        {
          provide: 'ORG_SUBSCRIPTION_REPOSITORY',
          useValue: orgSubscriptionRepo,
        },
        { provide: TrialService, useValue: trialService },
        { provide: RlsContextService, useValue: createMockRlsContextService() },
      ],
    }).compile();

    service = module.get<FeaturesService>(FeaturesService);
    featureOverrideRepo = module.get<IFeatureOverrideRepository>(
      'FEATURE_OVERRIDE_REPOSITORY',
    );
    tenantRepo = module.get<ITenantRepository>('TENANT_REPOSITORY');
  });

  it('returns pro tier when trial is active', async () => {
    // Arrange
    orgSubscriptionRepo.findByTenantId.mockResolvedValue({
      ...baseSubscription,
      trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    trialService.getTrialState.mockResolvedValue({
      active: true,
      daysRemaining: 5,
      endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Act
    const result = await service.getTenantFeatures('tenant-1');

    // Assert
    expect(result.tier).toBe('pro');
    expect(result.features.advancedAutocomplete).toBe(true);
    expect(result.features.executionHistory).toBe(true);
    expect(result.trial).toEqual(
      expect.objectContaining({ active: true, daysRemaining: 5 }),
    );
  });

  it('returns free tier when trial is expired and no Stripe subscription', async () => {
    // Arrange
    orgSubscriptionRepo.findByTenantId.mockResolvedValue({
      ...baseSubscription,
      trialEndsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      stripeSubscriptionId: null,
    });
    trialService.getTrialState.mockResolvedValue({
      active: false,
      daysRemaining: 0,
      endsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Act
    const result = await service.getTenantFeatures('tenant-1');

    // Assert
    expect(result.tier).toBe('free');
    expect(result.features.advancedAutocomplete).toBe(false);
    expect(result.features.basicLinting).toBe(true);
    expect(result.trial).toEqual(
      expect.objectContaining({ active: false, daysRemaining: 0 }),
    );
  });

  it('uses subscription tier when Stripe subscription exists', async () => {
    // Arrange
    orgSubscriptionRepo.findByTenantId.mockResolvedValue({
      ...baseSubscription,
      tier: 'enterprise',
      stripeSubscriptionId: 'sub_stripe_123',
      trialEndsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });

    // Act
    const result = await service.getTenantFeatures('tenant-1');

    // Assert
    expect(result.tier).toBe('enterprise');
    expect(result.features.teamSnippets).toBe(true);
    expect(result.features.auditLogs).toBe(true);
  });

  it('defaults to free tier when no org_subscriptions row exists', async () => {
    // Arrange
    orgSubscriptionRepo.findByTenantId.mockResolvedValue(undefined);
    vi.mocked(tenantRepo.findById).mockResolvedValue({
      ...baseTenant,
    });

    // Act
    const result = await service.getTenantFeatures('tenant-1');

    // Assert — tier defaults to 'free' when no org_subscriptions row
    expect(result.tier).toBe('free');
    expect(result.features.advancedAutocomplete).toBe(false);
    expect(result.features.basicLinting).toBe(true);
    expect(result.trial).toBeNull();
  });

  it('applies feature overrides on top of org_subscriptions tier', async () => {
    // Arrange
    orgSubscriptionRepo.findByTenantId.mockResolvedValue({
      ...baseSubscription,
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const overrides: TenantFeatureOverride[] = [
      {
        id: 'override-1',
        tenantId: 'tenant-1',
        featureKey: 'minimap',
        enabled: false,
        createdAt: new Date(),
      },
    ];
    vi.mocked(featureOverrideRepo.findByTenantId).mockResolvedValue(overrides);

    // Act
    const result = await service.getTenantFeatures('tenant-1');

    // Assert
    expect(result.tier).toBe('pro');
    expect(result.features.minimap).toBe(false);
    expect(result.features.advancedAutocomplete).toBe(true);
  });

  it('calls orgSubscriptionRepo.findByTenantId for tier lookup', async () => {
    // Arrange
    orgSubscriptionRepo.findByTenantId.mockResolvedValue({
      ...baseSubscription,
    });

    // Act
    await service.getTenantFeatures('tenant-1');

    // Assert
    expect(orgSubscriptionRepo.findByTenantId).toHaveBeenCalledWith('tenant-1');
  });

  it('throws RESOURCE_NOT_FOUND when tenant does not exist', async () => {
    // Arrange
    vi.mocked(tenantRepo.findById).mockResolvedValue(undefined);

    // Act & Assert
    await expect(
      service.getTenantFeatures('nonexistent'),
    ).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  describe('backward compatibility', () => {
    it('resolves free tier features correctly', async () => {
      // Arrange
      orgSubscriptionRepo.findByTenantId.mockResolvedValue(undefined);
      vi.mocked(tenantRepo.findById).mockResolvedValue({
        ...baseTenant,
      });

      // Act
      const result = await service.getTenantFeatures('tenant-1');

      // Assert
      expect(result).toEqual({
        tier: 'free',
        features: {
          basicLinting: true,
          syntaxHighlighting: true,
          systemDataViews: true,
          quickFixes: false,
          minimap: false,
          advancedAutocomplete: false,
          querySharing: false,
          createDataExtension: false,
          teamSnippets: false,
          teamCollaboration: false,
          auditLogs: false,
          deployToAutomation: false,
          runToTargetDE: false,
          executionHistory: false,
          versionHistory: false,
        },
        trial: null,
      });
    });

    it('resolves pro tier features correctly', async () => {
      // Arrange
      orgSubscriptionRepo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        stripeSubscriptionId: 'sub_123',
        tier: 'pro',
      });

      // Act
      const result = await service.getTenantFeatures('tenant-1');

      // Assert
      expect(result).toEqual({
        tier: 'pro',
        features: {
          basicLinting: true,
          syntaxHighlighting: true,
          systemDataViews: true,
          quickFixes: true,
          minimap: true,
          advancedAutocomplete: true,
          querySharing: true,
          createDataExtension: true,
          teamSnippets: false,
          teamCollaboration: false,
          auditLogs: false,
          deployToAutomation: true,
          runToTargetDE: true,
          executionHistory: true,
          versionHistory: true,
        },
        trial: null,
      });
    });

    it('resolves enterprise tier features correctly', async () => {
      // Arrange
      orgSubscriptionRepo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        stripeSubscriptionId: 'sub_123',
        tier: 'enterprise',
      });

      // Act
      const result = await service.getTenantFeatures('tenant-1');

      // Assert
      expect(result).toEqual({
        tier: 'enterprise',
        features: {
          basicLinting: true,
          syntaxHighlighting: true,
          systemDataViews: true,
          quickFixes: true,
          minimap: true,
          advancedAutocomplete: true,
          querySharing: true,
          createDataExtension: true,
          teamSnippets: true,
          teamCollaboration: true,
          auditLogs: true,
          deployToAutomation: true,
          runToTargetDE: true,
          executionHistory: true,
          versionHistory: true,
        },
        trial: null,
      });
    });
  });
});
