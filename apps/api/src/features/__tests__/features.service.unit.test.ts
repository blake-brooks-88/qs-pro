import { Test, TestingModule } from '@nestjs/testing';
import type {
  IFeatureOverrideRepository,
  ITenantRepository,
  TenantFeatureOverride,
} from '@qpp/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeaturesService } from '../features.service';

describe('FeaturesService', () => {
  let service: FeaturesService;
  let featureOverrideRepo: IFeatureOverrideRepository;
  let tenantRepo: ITenantRepository;

  beforeEach(async () => {
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
            findById: vi.fn().mockResolvedValue({
              id: 'tenant-1',
              eid: 'eid-1',
              tssd: 'test-tssd',
              subscriptionTier: 'free',
              seatLimit: null,
              installedAt: new Date(),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FeaturesService>(FeaturesService);
    featureOverrideRepo = module.get<IFeatureOverrideRepository>(
      'FEATURE_OVERRIDE_REPOSITORY',
    );
    tenantRepo = module.get<ITenantRepository>('TENANT_REPOSITORY');
  });

  it('resolves free tier to free features only', async () => {
    // Arrange
    const tenantId = 'tenant-1';
    vi.mocked(tenantRepo.findById).mockResolvedValue({
      id: tenantId,
      eid: 'eid-1',
      tssd: 'test-tssd',
      subscriptionTier: 'free',
      seatLimit: null,
      installedAt: new Date(),
    });

    // Act
    const features = await service.getTenantFeatures(tenantId);

    // Assert
    expect(features.basicLinting).toBe(true);
    expect(features.syntaxHighlighting).toBe(true);
    expect(features.quickFixes).toBe(false);
    expect(features.minimap).toBe(false);
    expect(features.advancedAutocomplete).toBe(false);
    expect(features.teamSnippets).toBe(false);
    expect(features.auditLogs).toBe(false);
    expect(tenantRepo.findById).toHaveBeenCalledWith(tenantId);
    expect(featureOverrideRepo.findByTenantId).toHaveBeenCalledWith(tenantId);
  });

  it('resolves pro tier to pro+free features', async () => {
    // Arrange
    const tenantId = 'tenant-2';
    vi.mocked(tenantRepo.findById).mockResolvedValue({
      id: tenantId,
      eid: 'eid-2',
      tssd: 'test-tssd',
      subscriptionTier: 'pro',
      seatLimit: 10,
      installedAt: new Date(),
    });

    // Act
    const features = await service.getTenantFeatures(tenantId);

    // Assert
    expect(features.basicLinting).toBe(true);
    expect(features.syntaxHighlighting).toBe(true);
    expect(features.quickFixes).toBe(true);
    expect(features.minimap).toBe(true);
    expect(features.advancedAutocomplete).toBe(true);
    expect(features.teamSnippets).toBe(false);
    expect(features.auditLogs).toBe(false);
  });

  it('applies enable override (free tenant gets pro feature)', async () => {
    // Arrange
    const tenantId = 'tenant-3';
    vi.mocked(tenantRepo.findById).mockResolvedValue({
      id: tenantId,
      eid: 'eid-3',
      tssd: 'test-tssd',
      subscriptionTier: 'free',
      seatLimit: null,
      installedAt: new Date(),
    });

    const overrides: TenantFeatureOverride[] = [
      {
        id: 'override-1',
        tenantId,
        featureKey: 'quickFixes',
        enabled: true,
        createdAt: new Date(),
      },
    ];
    vi.mocked(featureOverrideRepo.findByTenantId).mockResolvedValue(overrides);

    // Act
    const features = await service.getTenantFeatures(tenantId);

    // Assert
    expect(features.basicLinting).toBe(true);
    expect(features.syntaxHighlighting).toBe(true);
    expect(features.quickFixes).toBe(true); // Enabled by override
    expect(features.minimap).toBe(false);
    expect(features.advancedAutocomplete).toBe(false);
  });

  it('applies disable override (pro tenant loses feature)', async () => {
    // Arrange
    const tenantId = 'tenant-4';
    vi.mocked(tenantRepo.findById).mockResolvedValue({
      id: tenantId,
      eid: 'eid-4',
      tssd: 'test-tssd',
      subscriptionTier: 'pro',
      seatLimit: 10,
      installedAt: new Date(),
    });

    const overrides: TenantFeatureOverride[] = [
      {
        id: 'override-2',
        tenantId,
        featureKey: 'minimap',
        enabled: false,
        createdAt: new Date(),
      },
    ];
    vi.mocked(featureOverrideRepo.findByTenantId).mockResolvedValue(overrides);

    // Act
    const features = await service.getTenantFeatures(tenantId);

    // Assert
    expect(features.basicLinting).toBe(true);
    expect(features.syntaxHighlighting).toBe(true);
    expect(features.quickFixes).toBe(true);
    expect(features.minimap).toBe(false); // Disabled by override
    expect(features.advancedAutocomplete).toBe(true);
    expect(features.teamSnippets).toBe(false);
    expect(features.auditLogs).toBe(false);
  });

  it('resolves enterprise tier to enterprise+pro+free features', async () => {
    // Arrange
    const tenantId = 'tenant-5';
    vi.mocked(tenantRepo.findById).mockResolvedValue({
      id: tenantId,
      eid: 'eid-5',
      tssd: 'test-tssd',
      subscriptionTier: 'enterprise',
      seatLimit: 50,
      installedAt: new Date(),
    });

    // Act
    const features = await service.getTenantFeatures(tenantId);

    // Assert - should have all features
    expect(features.basicLinting).toBe(true);
    expect(features.syntaxHighlighting).toBe(true);
    expect(features.quickFixes).toBe(true);
    expect(features.minimap).toBe(true);
    expect(features.advancedAutocomplete).toBe(true);
    expect(features.teamSnippets).toBe(true);
    expect(features.auditLogs).toBe(true);
    expect(features.deployToAutomation).toBe(true);
  });
});
