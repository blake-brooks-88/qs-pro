import { Test, TestingModule } from '@nestjs/testing';
import { AppError, ErrorCode, SeatLimitService } from '@qpp/backend-shared';
import type {
  IOrgSubscriptionRepository,
  ITenantRepository,
  Tenant,
} from '@qpp/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SeatLimitService', () => {
  let service: SeatLimitService;
  let tenantRepo: ITenantRepository;
  let orgSubscriptionRepo: IOrgSubscriptionRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeatLimitService,
        {
          provide: 'TENANT_REPOSITORY',
          useValue: {
            findById: vi.fn(),
            countUsersByTenantId: vi.fn(),
          },
        },
        {
          provide: 'ORG_SUBSCRIPTION_REPOSITORY',
          useValue: {
            findByTenantId: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SeatLimitService>(SeatLimitService);
    tenantRepo = module.get<ITenantRepository>('TENANT_REPOSITORY');
    orgSubscriptionRepo = module.get<IOrgSubscriptionRepository>(
      'ORG_SUBSCRIPTION_REPOSITORY',
    );
  });

  it('allows user when under seat limit', async () => {
    const tenantId = 'tenant-1';
    const mockTenant: Tenant = {
      id: tenantId,
      eid: 'test---seat-limit-1',
      tssd: 'test-tssd',
      auditRetentionDays: 365,
      installedAt: new Date(),
      deletedAt: null,
      deletionMetadata: null,
    };

    vi.mocked(tenantRepo.findById).mockResolvedValue(mockTenant);
    vi.mocked(orgSubscriptionRepo.findByTenantId).mockResolvedValue({
      id: 'sub-1',
      tenantId,
      tier: 'pro',
      stripeSubscriptionStatus: 'inactive',
      seatLimit: 10,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: null,
      currentPeriodEnds: null,
      lastInvoicePaidAt: null,
      stripeStateUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(tenantRepo.countUsersByTenantId).mockResolvedValue(5);

    await expect(service.checkSeatLimit(tenantId)).resolves.toBeUndefined();
  });

  it('throws AppError with SEAT_LIMIT_EXCEEDED when at seat limit', async () => {
    const tenantId = 'tenant-2';
    const mockTenant: Tenant = {
      id: tenantId,
      eid: 'test---seat-limit-2',
      tssd: 'test-tssd',
      auditRetentionDays: 365,
      installedAt: new Date(),
      deletedAt: null,
      deletionMetadata: null,
    };

    vi.mocked(tenantRepo.findById).mockResolvedValue(mockTenant);
    vi.mocked(orgSubscriptionRepo.findByTenantId).mockResolvedValue({
      id: 'sub-2',
      tenantId,
      tier: 'pro',
      stripeSubscriptionStatus: 'inactive',
      seatLimit: 10,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: null,
      currentPeriodEnds: null,
      lastInvoicePaidAt: null,
      stripeStateUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(tenantRepo.countUsersByTenantId).mockResolvedValue(10);

    await expect(service.checkSeatLimit(tenantId)).rejects.toThrow(AppError);
    await expect(service.checkSeatLimit(tenantId)).rejects.toMatchObject({
      code: ErrorCode.SEAT_LIMIT_EXCEEDED,
    });
  });

  it('throws AppError with SEAT_LIMIT_EXCEEDED when over seat limit', async () => {
    const tenantId = 'tenant-3';
    const mockTenant: Tenant = {
      id: tenantId,
      eid: 'test---seat-limit-3',
      tssd: 'test-tssd',
      auditRetentionDays: 365,
      installedAt: new Date(),
      deletedAt: null,
      deletionMetadata: null,
    };

    vi.mocked(tenantRepo.findById).mockResolvedValue(mockTenant);
    vi.mocked(orgSubscriptionRepo.findByTenantId).mockResolvedValue({
      id: 'sub-3',
      tenantId,
      tier: 'pro',
      stripeSubscriptionStatus: 'inactive',
      seatLimit: 10,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: null,
      currentPeriodEnds: null,
      lastInvoicePaidAt: null,
      stripeStateUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(tenantRepo.countUsersByTenantId).mockResolvedValue(15);

    await expect(service.checkSeatLimit(tenantId)).rejects.toThrow(AppError);
    await expect(service.checkSeatLimit(tenantId)).rejects.toMatchObject({
      code: ErrorCode.SEAT_LIMIT_EXCEEDED,
    });
  });

  it('allows unlimited users when seat limit is null', async () => {
    const tenantId = 'tenant-4';
    const mockTenant: Tenant = {
      id: tenantId,
      eid: 'test---seat-limit-4',
      tssd: 'test-tssd',
      auditRetentionDays: 365,
      installedAt: new Date(),
      deletedAt: null,
      deletionMetadata: null,
    };

    vi.mocked(tenantRepo.findById).mockResolvedValue(mockTenant);
    vi.mocked(orgSubscriptionRepo.findByTenantId).mockResolvedValue({
      id: 'sub-4',
      tenantId,
      tier: 'enterprise',
      stripeSubscriptionStatus: 'inactive',
      seatLimit: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: null,
      currentPeriodEnds: null,
      lastInvoicePaidAt: null,
      stripeStateUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(tenantRepo.countUsersByTenantId).mockResolvedValue(1000);

    await expect(service.checkSeatLimit(tenantId)).resolves.toBeUndefined();
  });

  it('allows when tenant is not found', async () => {
    const tenantId = 'missing-tenant';
    vi.mocked(tenantRepo.findById).mockResolvedValue(undefined);

    await expect(service.checkSeatLimit(tenantId)).resolves.toBeUndefined();
    expect(tenantRepo.countUsersByTenantId).not.toHaveBeenCalled();
  });

  it('allows when no org_subscriptions row exists', async () => {
    const tenantId = 'tenant-no-sub';
    const mockTenant: Tenant = {
      id: tenantId,
      eid: 'test---seat-limit-nosub',
      tssd: 'test-tssd',
      auditRetentionDays: 365,
      installedAt: new Date(),
      deletedAt: null,
      deletionMetadata: null,
    };

    vi.mocked(tenantRepo.findById).mockResolvedValue(mockTenant);
    vi.mocked(orgSubscriptionRepo.findByTenantId).mockResolvedValue(undefined);

    await expect(service.checkSeatLimit(tenantId)).resolves.toBeUndefined();
    expect(tenantRepo.countUsersByTenantId).not.toHaveBeenCalled();
  });
});
