import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TenantsService } from './tenants.service.js';
import { DRIZZLE_DB } from '../database/database.module.js';

function createMockDb() {
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };
  return {
    select: vi.fn().mockReturnValue(chain),
    _selectChain: chain,
  };
}

const SAMPLE_TENANT_ROW = {
  tenantId: '550e8400-e29b-41d4-a716-446655440000',
  eid: '100012345',
  companyName: 'acme-corp',
  tier: 'pro' as const,
  subscriptionStatus: 'active' as const,
  userCount: 5,
  signupDate: new Date('2025-06-15'),
  lastActiveDate: new Date('2026-03-01'),
};

describe('TenantsService', () => {
  let service: TenantsService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: DRIZZLE_DB, useValue: mockDb },
      ],
    }).compile();

    service = module.get(TenantsService);
  });

  it('should return paginated tenant list with correct DTO shape', async () => {
    mockDb._selectChain.offset.mockResolvedValueOnce([SAMPLE_TENANT_ROW]);

    const result = await service.findAll({ page: 1, limit: 25 });

    expect(result.data).toHaveLength(1);
    const item = result.data[0];
    expect(item).toHaveProperty('tenantId');
    expect(item).toHaveProperty('eid');
    expect(item).toHaveProperty('companyName');
    expect(item).toHaveProperty('tier');
    expect(item).toHaveProperty('subscriptionStatus');
    expect(item).toHaveProperty('userCount');
    expect(item).toHaveProperty('signupDate');
  });

  it('should apply search filter (ILIKE) on EID and company name', async () => {
    mockDb._selectChain.offset.mockResolvedValueOnce([]);

    await service.findAll({ page: 1, limit: 25, search: 'acme' });

    expect(mockDb._selectChain.where).toHaveBeenCalled();
  });

  it('should apply tier and status filters', async () => {
    mockDb._selectChain.offset.mockResolvedValueOnce([]);

    await service.findAll({
      page: 1,
      limit: 25,
      tier: 'pro',
      status: 'active',
    });

    expect(mockDb._selectChain.where).toHaveBeenCalled();
  });

  it('should return full tenant detail with subscription data', async () => {
    const detailRow = {
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      eid: '100012345',
      companyName: 'acme-corp',
      tier: 'pro',
      subscriptionStatus: 'active',
      seatLimit: 10,
      currentPeriodEnds: new Date('2026-04-15'),
      trialEndsAt: null,
      stripeSubscriptionId: 'sub_123',
      signupDate: new Date('2025-06-15'),
    };

    mockDb._selectChain.offset.mockResolvedValueOnce([detailRow]);

    const result = await service.findById(
      '550e8400-e29b-41d4-a716-446655440000',
    );

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('tenantId');
    expect(result?.tenantId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('should return only safe fields from EID lookup', async () => {
    const lookupRow = {
      eid: '100012345',
      companyName: 'acme-corp',
      userCount: 5,
      tier: 'pro',
      subscriptionStatus: 'active',
      signupDate: new Date('2025-06-15'),
    };

    mockDb._selectChain.offset.mockResolvedValueOnce([lookupRow]);

    const result = await service.lookupByEid('100012345');

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('eid');
    expect(result).toHaveProperty('companyName');
    expect(result).toHaveProperty('tier');
    expect(result).not.toHaveProperty('tenantId');
    expect(result).not.toHaveProperty('email');
  });

  it('should return null from EID lookup when tenant not found', async () => {
    mockDb._selectChain.offset.mockResolvedValueOnce([]);

    const result = await service.lookupByEid('nonexistent');

    expect(result).toBeNull();
  });

  it('should derive lastActiveDate from query results', async () => {
    const rowWithActivity = {
      ...SAMPLE_TENANT_ROW,
      lastActiveDate: new Date('2026-03-07T12:00:00Z'),
    };

    mockDb._selectChain.offset.mockResolvedValueOnce([rowWithActivity]);

    const result = await service.findAll({ page: 1, limit: 25 });

    expect(result.data[0]?.lastActiveDate).toEqual(
      new Date('2026-03-07T12:00:00Z'),
    );
  });
});
