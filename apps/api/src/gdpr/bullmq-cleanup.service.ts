import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';

const QUEUES_TO_CLEAN = ['shell-query', 'siem-webhook'] as const;

@Injectable()
export class BullmqCleanupService {
  private readonly logger = new Logger(BullmqCleanupService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async removeJobsForTenant(tenantId: string): Promise<void> {
    for (const queueName of QUEUES_TO_CLEAN) {
      const removed = await this.removeFromQueue(queueName, tenantId);
      this.logger.log(
        `Removed ${removed} jobs from ${queueName} queue for tenant ${tenantId}`,
      );
    }
  }

  private async removeFromQueue(
    queueName: string,
    tenantId: string,
  ): Promise<number> {
    const connection = this.redis.duplicate() as unknown as ConnectionOptions;
    const queue = new Queue(queueName, { connection });

    try {
      const jobs = await queue.getJobs(['waiting', 'delayed', 'active']);
      let removed = 0;

      for (const job of jobs) {
        if (job.data?.tenantId !== tenantId) {
          continue;
        }

        const state = await job.getState();
        if (state === 'active') {
          await job.moveToFailed(
            new Error('Tenant deleted'),
            'tenant-deleted',
            true,
          );
        } else {
          await job.remove();
        }
        removed++;
      }

      return removed;
    } finally {
      await queue.close();
    }
  }
}
