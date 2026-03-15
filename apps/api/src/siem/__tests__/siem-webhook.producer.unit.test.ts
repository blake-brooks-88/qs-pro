import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import type { SiemWebhookJobData } from '../siem.types';
import { SiemWebhookProducer } from '../siem-webhook.producer';

describe('SiemWebhookProducer', () => {
  it('enqueues a BullMQ job with expected retry/backoff options', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as Queue;
    const producer = new SiemWebhookProducer(queue);

    const jobData: SiemWebhookJobData = {
      tenantId: 'tenant-1',
      mid: '12345',
      eventType: 'audit.event',
      payload: { id: 'evt-1' },
      deliveredAt: null,
    };

    await producer.enqueue(jobData);

    expect(add).toHaveBeenCalledWith('deliver-webhook', jobData, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });
  });
});
