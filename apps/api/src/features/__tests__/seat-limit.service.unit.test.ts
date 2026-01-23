import { Test, TestingModule } from '@nestjs/testing';
import { AppError, ErrorCode, SeatLimitService } from '@qpp/backend-shared';
import type { ITenantRepository, Tenant } from '@qpp/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SeatLimitService', () => {
  let service: SeatLimitService;
  let tenantRepo: ITenantRepository;

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
      ],
    }).compile();

    service = module.get<SeatLimitService>(SeatLimitService);
    tenantRepo = module.get<ITenantRepository>('TENANT_REPOSITORY');
  });

  it('allows user when under seat limit', async () => {
    // Arrange
    const tenantId = 'tenant-1';
    const mockTenant: Tenant = {
      id: tenantId,
      eid: 'eid-1',
      tssd: 'test-tssd',
      subscriptionTier: 'pro',
      seatLimit: 10,
      installedAt: new Date(),
    };

    vi.mocked(tenantRepo.findById).mockResolvedValue(mockTenant);
    vi.mocked(tenantRepo.countUsersByTenantId).mockResolvedValue(5);

    // Act & Assert
    await expect(service.checkSeatLimit(tenantId)).resolves.not.toThrow();
    expect(tenantRepo.findById).toHaveBeenCalledWith(tenantId);
    expect(tenantRepo.countUsersByTenantId).toHaveBeenCalledWith(tenantId);
  });

  it('throws AppError with SEAT_LIMIT_EXCEEDED when at seat limit', async () => {
    // Arrange
    const tenantId = 'tenant-2';
    const mockTenant: Tenant = {
      id: tenantId,
      eid: 'eid-2',
      tssd: 'test-tssd',
      subscriptionTier: 'pro',
      seatLimit: 10,
      installedAt: new Date(),
    };

    vi.mocked(tenantRepo.findById).mockResolvedValue(mockTenant);
    vi.mocked(tenantRepo.countUsersByTenantId).mockResolvedValue(10);

    // Act & Assert
    await expect(service.checkSeatLimit(tenantId)).rejects.toThrow(AppError);
    await expect(service.checkSeatLimit(tenantId)).rejects.toMatchObject({
      code: ErrorCode.SEAT_LIMIT_EXCEEDED,
    });
  });

  it('throws AppError with SEAT_LIMIT_EXCEEDED when over seat limit', async () => {
    // Arrange
    const tenantId = 'tenant-3';
    const mockTenant: Tenant = {
      id: tenantId,
      eid: 'eid-3',
      tssd: 'test-tssd',
      subscriptionTier: 'pro',
      seatLimit: 10,
      installedAt: new Date(),
    };

    vi.mocked(tenantRepo.findById).mockResolvedValue(mockTenant);
    vi.mocked(tenantRepo.countUsersByTenantId).mockResolvedValue(15);

    // Act & Assert
    await expect(service.checkSeatLimit(tenantId)).rejects.toThrow(AppError);
    await expect(service.checkSeatLimit(tenantId)).rejects.toMatchObject({
      code: ErrorCode.SEAT_LIMIT_EXCEEDED,
    });
  });

  it('allows unlimited users when seat limit is null', async () => {
    // Arrange
    const tenantId = 'tenant-4';
    const mockTenant: Tenant = {
      id: tenantId,
      eid: 'eid-4',
      tssd: 'test-tssd',
      subscriptionTier: 'enterprise',
      seatLimit: null,
      installedAt: new Date(),
    };

    vi.mocked(tenantRepo.findById).mockResolvedValue(mockTenant);
    vi.mocked(tenantRepo.countUsersByTenantId).mockResolvedValue(1000);

    // Act & Assert
    await expect(service.checkSeatLimit(tenantId)).resolves.not.toThrow();
    expect(tenantRepo.findById).toHaveBeenCalledWith(tenantId);
    // Should not even check user count when limit is null
  });
});
