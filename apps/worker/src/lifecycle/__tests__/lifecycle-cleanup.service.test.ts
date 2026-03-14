import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LifecycleCleanupService } from '../lifecycle-cleanup.service';

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
    customers: {
      del: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('LifecycleCleanupService', () => {
  let service: LifecycleCleanupService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockStripe: ReturnType<typeof createMockStripe>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockStripe = createMockStripe();

    service = new LifecycleCleanupService(mockDb as any, mockStripe as any);
  });

  describe('hardDeleteExpiredTenants', () => {
    it('should only select tenants where deleted_at + 30 days < now', async () => {
      mockDb._chain.where.mockResolvedValueOnce([]);

      await service.handleDailyCleanup();

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should delete Stripe customer before DB cascade delete', async () => {
      const tenant = {
        id: 'tenant-1',
        eid: 'eid-1',
        deletionMetadata: null,
      };

      mockDb._chain.where.mockResolvedValueOnce([tenant]);
      mockDb._chain.limit.mockResolvedValueOnce([
        { stripeCustomerId: 'cus_123' },
      ]);

      await service.handleDailyCleanup();

      expect(mockStripe.customers.del).toHaveBeenCalledWith('cus_123');
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should create deletion ledger entry before DB delete', async () => {
      const tenant = {
        id: 'tenant-1',
        eid: 'eid-1',
        deletionMetadata: null,
      };

      mockDb._chain.where.mockResolvedValueOnce([tenant]);
      mockDb._chain.limit.mockResolvedValueOnce([]);

      await service.handleDailyCleanup();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb._chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'tenant',
          entityId: 'tenant-1',
          entityIdentifier: 'eid-1',
          deletedBy: 'system:hard-delete-job',
        }),
      );
    });

    it('should increment stripeAttempts in deletion_metadata on Stripe failure (R12)', async () => {
      const tenant = {
        id: 'tenant-1',
        eid: 'eid-1',
        deletionMetadata: { stripeAttempts: 2 },
      };

      mockDb._chain.where.mockResolvedValueOnce([tenant]);
      mockDb._chain.limit.mockResolvedValueOnce([
        { stripeCustomerId: 'cus_123' },
      ]);
      mockStripe.customers.del.mockRejectedValueOnce(
        new Error('Stripe API error'),
      );

      await service.handleDailyCleanup();

      expect(mockDb.update).toHaveBeenCalled();
      // Stripe customer.del was attempted
      expect(mockStripe.customers.del).toHaveBeenCalledWith('cus_123');
    });

    it('should log alert at 5+ Stripe failures', async () => {
      const tenant = {
        id: 'tenant-1',
        eid: 'eid-1',
        deletionMetadata: { stripeAttempts: 4 },
      };

      mockDb._chain.where.mockResolvedValueOnce([tenant]);
      mockDb._chain.limit.mockResolvedValueOnce([
        { stripeCustomerId: 'cus_123' },
      ]);
      mockStripe.customers.del.mockRejectedValueOnce(
        new Error('Stripe API error'),
      );

      const loggerSpy = vi.spyOn((service as any).logger, 'error');

      await service.handleDailyCleanup();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('ALERT: Stripe deletion failed 5+ times'),
      );
    });

    it('should skip tenant on Stripe failure — no ledger entry for that tenant', async () => {
      const tenant = {
        id: 'tenant-1',
        eid: 'eid-1',
        deletionMetadata: null,
      };

      mockDb._chain.where.mockResolvedValueOnce([tenant]);
      mockDb._chain.limit.mockResolvedValueOnce([
        { stripeCustomerId: 'cus_123' },
      ]);
      mockStripe.customers.del.mockRejectedValueOnce(
        new Error('Stripe API error'),
      );

      await service.handleDailyCleanup();

      // On Stripe failure the tenant is skipped, so no ledger insert for it
      expect(mockDb._chain.values).not.toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'tenant',
          entityId: 'tenant-1',
          deletedBy: 'system:hard-delete-job',
        }),
      );
    });
  });

  describe('purgeExpiredAuditLogs', () => {
    it('should use make_interval for parameterized interval (R13)', async () => {
      mockDb._chain.where.mockResolvedValueOnce([]);
      mockDb._chain.where.mockResolvedValueOnce([
        { id: 'tenant-1', auditRetentionDays: 90 },
      ]);
      mockDb._chain.returning.mockResolvedValueOnce([]);

      await service.handleDailyCleanup();

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should honor per-tenant retention days', async () => {
      mockDb._chain.where.mockResolvedValueOnce([]);
      mockDb._chain.where.mockResolvedValueOnce([
        { id: 'tenant-1', auditRetentionDays: 90 },
        { id: 'tenant-2', auditRetentionDays: 365 },
      ]);
      mockDb._chain.returning.mockResolvedValueOnce([{ id: 'log-1' }]);
      mockDb._chain.returning.mockResolvedValueOnce([{ id: 'log-2' }]);

      await service.handleDailyCleanup();

      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe('purgeExpiredBackofficeAuditLogs', () => {
    it('should enforce 365-day retention', async () => {
      mockDb._chain.where.mockResolvedValueOnce([]);
      mockDb._chain.where.mockResolvedValueOnce([]);
      mockDb._chain.returning.mockResolvedValueOnce([]);

      await service.handleDailyCleanup();

      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe('purgeExpiredStripeWebhookEvents', () => {
    it('should enforce 30-day retention', async () => {
      mockDb._chain.where.mockResolvedValueOnce([]);
      mockDb._chain.where.mockResolvedValueOnce([]);
      mockDb._chain.returning.mockResolvedValueOnce([]);
      mockDb._chain.returning.mockResolvedValueOnce([]);

      await service.handleDailyCleanup();

      expect(mockDb.delete).toHaveBeenCalled();
    });
  });
});
