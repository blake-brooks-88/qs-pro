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

    // Assert - free tier gets basic features + systemDataViews only
    expect(features).toEqual({
      basicLinting: true,
      syntaxHighlighting: true,
      systemDataViews: true,
      quickFixes: false,
      minimap: false,
      advancedAutocomplete: false,
      createDataExtension: false,
      teamSnippets: false,
      auditLogs: false,
      deployToAutomation: false,
    });
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

    // Assert - pro tier gets additional features but not enterprise features
    expect(features).toEqual({
      basicLinting: true,
      syntaxHighlighting: true,
      systemDataViews: true,
      quickFixes: true,
      minimap: true,
      advancedAutocomplete: true,
      createDataExtension: true,
      teamSnippets: false,
      auditLogs: false,
      deployToAutomation: false,
    });
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

    // Assert - free tier with quickFixes enabled via override
    expect(features).toEqual({
      basicLinting: true,
      syntaxHighlighting: true,
      systemDataViews: true,
      quickFixes: true, // Enabled by override
      minimap: false,
      advancedAutocomplete: false,
      createDataExtension: false,
      teamSnippets: false,
      auditLogs: false,
      deployToAutomation: false,
    });
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

    // Assert - pro tier with minimap disabled via override
    expect(features).toEqual({
      basicLinting: true,
      syntaxHighlighting: true,
      systemDataViews: true,
      quickFixes: true,
      minimap: false, // Disabled by override
      advancedAutocomplete: true,
      createDataExtension: true,
      teamSnippets: false,
      auditLogs: false,
      deployToAutomation: false,
    });
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

    // Assert - enterprise tier gets all features
    expect(features).toEqual({
      basicLinting: true,
      syntaxHighlighting: true,
      systemDataViews: true,
      quickFixes: true,
      minimap: true,
      advancedAutocomplete: true,
      createDataExtension: true,
      teamSnippets: true,
      auditLogs: true,
      deployToAutomation: true,
    });
  });
});
