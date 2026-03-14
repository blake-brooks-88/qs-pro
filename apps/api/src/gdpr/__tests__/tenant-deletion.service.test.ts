import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantDeletionService } from '../tenant-deletion.service';

function createMockDb() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    values: vi.fn().mockResolvedValue(undefined),
    returning: vi.fn().mockResolvedValue([]),
  };

  return {
    select: vi.fn().mockReturnValue(chain),
    update: vi.fn().mockReturnValue(chain),
    insert: vi.fn().mockReturnValue(chain),
    delete: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

function createMockStripe() {
  return {
    subscriptions: {
      cancel: vi.fn().mockResolvedValue({}),
    },
  };
}

function createMockRedisCleanup() {
  return {
    purgeForTenant: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockBullmqCleanup() {
  return {
    removeJobsForTenant: vi.fn().mockResolvedValue(undefined),
  };
}

const TENANT_ID = 'tenant-123';
const ACTOR_ID = 'actor-456';
const TENANT_EID = 'eid-abc';

describe('TenantDeletionService', () => {
  let service: TenantDeletionService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockStripe: ReturnType<typeof createMockStripe>;
  let mockRedis: ReturnType<typeof createMockRedisCleanup>;
  let mockBullmq: ReturnType<typeof createMockBullmqCleanup>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockStripe = createMockStripe();
    mockRedis = createMockRedisCleanup();
    mockBullmq = createMockBullmqCleanup();

    service = new TenantDeletionService(
      mockDb as any,
      mockStripe as any,
      mockRedis as any,
      mockBullmq as any,
    );
  });

  describe('softDeleteTenant', () => {
    it('should set deleted_at on tenant row', async () => {
      mockDb._chain.limit.mockResolvedValueOnce([
        { id: TENANT_ID, eid: TENANT_EID },
      ]);
      mockDb._chain.limit.mockResolvedValueOnce([]);

      await service.softDeleteTenant(TENANT_ID, ACTOR_ID);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb._chain.set).toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: expect.any(Date) }),
      );
    });

    it('should cancel Stripe subscription with prorate: true', async () => {
      const subId = 'sub_stripe123';
      mockDb._chain.limit.mockResolvedValueOnce([
        { id: TENANT_ID, eid: TENANT_EID },
      ]);
      mockDb._chain.limit.mockResolvedValueOnce([
        { stripeSubscriptionId: subId, stripeCustomerId: 'cus_123' },
      ]);

      await service.softDeleteTenant(TENANT_ID, ACTOR_ID);

      expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith(subId, {
        prorate: true,
      });
    });

    it('should not throw when Stripe cancellation fails', async () => {
      const subId = 'sub_stripe123';
      mockDb._chain.limit.mockResolvedValueOnce([
        { id: TENANT_ID, eid: TENANT_EID },
      ]);
      mockDb._chain.limit.mockResolvedValueOnce([
        { stripeSubscriptionId: subId, stripeCustomerId: 'cus_123' },
      ]);
      mockStripe.subscriptions.cancel.mockRejectedValueOnce(
        new Error('Stripe API error'),
      );

      await expect(
        service.softDeleteTenant(TENANT_ID, ACTOR_ID),
      ).resolves.toBeUndefined();
    });

    it('should call Redis cleanup with correct tenantId', async () => {
      mockDb._chain.limit.mockResolvedValueOnce([
        { id: TENANT_ID, eid: TENANT_EID },
      ]);
      mockDb._chain.limit.mockResolvedValueOnce([]);

      await service.softDeleteTenant(TENANT_ID, ACTOR_ID);

      expect(mockRedis.purgeForTenant).toHaveBeenCalledWith(TENANT_ID);
    });

    it('should call BullMQ cleanup with correct tenantId', async () => {
      mockDb._chain.limit.mockResolvedValueOnce([
        { id: TENANT_ID, eid: TENANT_EID },
      ]);
      mockDb._chain.limit.mockResolvedValueOnce([]);

      await service.softDeleteTenant(TENANT_ID, ACTOR_ID);

      expect(mockBullmq.removeJobsForTenant).toHaveBeenCalledWith(TENANT_ID);
    });

    it('should create deletion ledger entry with entity_type tenant and eid', async () => {
      mockDb._chain.limit.mockResolvedValueOnce([
        { id: TENANT_ID, eid: TENANT_EID },
      ]);
      mockDb._chain.limit.mockResolvedValueOnce([]);

      await service.softDeleteTenant(TENANT_ID, ACTOR_ID);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb._chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'tenant',
          entityId: TENANT_ID,
          entityIdentifier: TENANT_EID,
          deletedBy: `admin:${ACTOR_ID}`,
        }),
      );
    });

    it('should throw when tenant does not exist', async () => {
      mockDb._chain.limit.mockResolvedValueOnce([]);

      await expect(
        service.softDeleteTenant(TENANT_ID, ACTOR_ID),
      ).rejects.toThrow(`Tenant not found: ${TENANT_ID}`);
    });
  });
});
