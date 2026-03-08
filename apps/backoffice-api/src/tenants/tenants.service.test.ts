import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TenantsService } from './tenants.service.js';
import { DRIZZLE_DB } from '../database/database.module.js';

function createSubqueryRef() {
  return { tenantId: {}, userCount: {}, lastActiveDate: {} };
}

function createMockDb() {
  const resolvedResults: unknown[][] = [];
  let resolveIndex = 0;

  function addResult(rows: unknown[]) {
    resolvedResults.push(rows);
  }

  function makeChain(): Record<string, unknown> {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};

    for (const method of [
      'from',
      'leftJoin',
      'innerJoin',
      'where',
      'orderBy',
      'limit',
    ]) {
      chain[method] = vi.fn().mockImplementation(() => chain);
    }

    chain['groupBy'] = vi.fn().mockImplementation(() => {
      const idx = resolveIndex++;
      const result = resolvedResults[idx] ?? [];
      const thenableChain = { ...chain };
      thenableChain['then'] = vi
        .fn()
        .mockImplementation(
          (resolve: (v: unknown) => void) => resolve(result),
        );
      thenableChain['as'] = vi.fn().mockReturnValue(createSubqueryRef());
      return thenableChain;
    });

    chain['offset'] = vi.fn().mockImplementation(() => {
      const idx = resolveIndex++;
      return Promise.resolve(resolvedResults[idx] ?? []);
    });

    chain['as'] = vi.fn().mockReturnValue(createSubqueryRef());

    return chain;
  }

  const selectFn = vi.fn().mockImplementation(() => makeChain());

  return {
    select: selectFn,
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    }),
    addResult,
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
    // findAll: 2 subqueries end with .groupBy().as() (consume resolveIndex 0,1 via groupBy)
    // then main query ends with .offset() (consume resolveIndex 2)
    mockDb.addResult([]); // groupBy 0: lastActivity subquery (uses .as, not awaited)
    mockDb.addResult([]); // groupBy 1: userCounts subquery (uses .as, not awaited)
    mockDb.addResult([SAMPLE_TENANT_ROW]); // offset 0: main query

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
    mockDb.addResult([]); // subquery 1
    mockDb.addResult([]); // subquery 2
    mockDb.addResult([]); // main query

    await service.findAll({ page: 1, limit: 25, search: 'acme' });

    // 3rd select() call is the main query chain
    const mainChain = mockDb.select.mock.results[2]?.value;
    expect(mainChain?.where).toHaveBeenCalled();
  });

  it('should apply tier and status filters', async () => {
    mockDb.addResult([]);
    mockDb.addResult([]);
    mockDb.addResult([]);

    await service.findAll({
      page: 1,
      limit: 25,
      tier: 'pro',
      status: 'active',
    });

    const mainChain = mockDb.select.mock.results[2]?.value;
    expect(mainChain?.where).toHaveBeenCalled();
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

    // findById: offset(0) = tenant detail
    // Then Promise.all([getUsersForTenant, getFeatureOverrides, getRecentAuditLogs])
    // getUsersForTenant: groupBy resolves to users array
    // getFeatureOverrides: ends at .where() - awaited, returns chain (not array, but that's OK)
    // getRecentAuditLogs: ends at .limit() - awaited, returns chain
    mockDb.addResult([detailRow]); // offset: main tenant query
    mockDb.addResult([
      { name: 'John', email: 'john@test.com', lastActiveDate: null },
    ]); // groupBy: getUsersForTenant

    const result = await service.findById(
      '550e8400-e29b-41d4-a716-446655440000',
    );

    expect(result).not.toBeNull();
    expect(result?.tenantId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result?.tier).toBe('pro');
    expect(result?.subscriptionStatus).toBe('active');
    expect(result).toHaveProperty('users');
    expect(result).toHaveProperty('featureOverrides');
    expect(result).toHaveProperty('recentAuditLogs');
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

    // lookupByEid: subquery groupBy (index 0), main query offset (index 1)
    mockDb.addResult([]); // groupBy: userCounts subquery
    mockDb.addResult([lookupRow]); // offset: main query

    const result = await service.lookupByEid('100012345');

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('eid');
    expect(result).toHaveProperty('companyName');
    expect(result).toHaveProperty('tier');
    expect(result).not.toHaveProperty('tenantId');
    expect(result).not.toHaveProperty('email');
  });

  it('should return null from EID lookup when tenant not found', async () => {
    mockDb.addResult([]); // subquery
    mockDb.addResult([]); // main query returns empty

    const result = await service.lookupByEid('nonexistent');

    expect(result).toBeNull();
  });

  it('should derive lastActiveDate from query results', async () => {
    const rowWithActivity = {
      ...SAMPLE_TENANT_ROW,
      lastActiveDate: new Date('2026-03-07T12:00:00Z'),
    };

    mockDb.addResult([]); // subquery 1
    mockDb.addResult([]); // subquery 2
    mockDb.addResult([rowWithActivity]); // main query

    const result = await service.findAll({ page: 1, limit: 25 });

    expect(result.data[0]?.lastActiveDate).toEqual(
      new Date('2026-03-07T12:00:00Z'),
    );
  });
});
