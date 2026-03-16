import { describe, expect, it, vi } from 'vitest';

const bullmqMocks = vi.hoisted(() => {
  const getJobs = vi.fn();
  const close = vi.fn().mockResolvedValue(undefined);
  const Queue = vi.fn().mockImplementation(() => ({ getJobs, close }));
  return { Queue, getJobs, close };
});

vi.mock('bullmq', () => ({
  Queue: bullmqMocks.Queue,
}));

import type Redis from 'ioredis';

import { BullmqCleanupService } from '../bullmq-cleanup.service';

describe('BullmqCleanupService', () => {
  it('removes jobs for a specific tenant across all queues', async () => {
    const redis = { duplicate: vi.fn(() => ({})) } as unknown as Redis;
    const service = new BullmqCleanupService(redis);

    const waitingJob = {
      data: { tenantId: 'tenant-1' },
      getState: vi.fn().mockResolvedValue('waiting'),
      remove: vi.fn().mockResolvedValue(undefined),
      moveToFailed: vi.fn().mockResolvedValue(undefined),
    };

    const activeJob = {
      data: { tenantId: 'tenant-1' },
      getState: vi.fn().mockResolvedValue('active'),
      remove: vi.fn().mockResolvedValue(undefined),
      moveToFailed: vi.fn().mockResolvedValue(undefined),
    };

    const otherTenantJob = {
      data: { tenantId: 'tenant-2' },
      getState: vi.fn().mockResolvedValue('waiting'),
      remove: vi.fn().mockResolvedValue(undefined),
      moveToFailed: vi.fn().mockResolvedValue(undefined),
    };

    bullmqMocks.getJobs
      .mockResolvedValueOnce([waitingJob, activeJob, otherTenantJob])
      .mockResolvedValueOnce([otherTenantJob]);

    await service.removeJobsForTenant('tenant-1');

    expect(bullmqMocks.Queue).toHaveBeenCalledTimes(2);
    expect(bullmqMocks.getJobs).toHaveBeenCalledWith([
      'waiting',
      'delayed',
      'active',
    ]);
    expect(bullmqMocks.close).toHaveBeenCalledTimes(2);

    expect(waitingJob.remove).toHaveBeenCalledOnce();
    expect(activeJob.moveToFailed).toHaveBeenCalledWith(
      expect.any(Error),
      'tenant-deleted',
      true,
    );
    const [error] = activeJob.moveToFailed.mock.calls[0] ?? [];
    expect((error as Error).message).toBe('Tenant deleted');

    expect(otherTenantJob.getState).not.toHaveBeenCalled();
    expect(otherTenantJob.remove).not.toHaveBeenCalled();
    expect(otherTenantJob.moveToFailed).not.toHaveBeenCalled();
  });
});
