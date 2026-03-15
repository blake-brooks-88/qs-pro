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
      webhookUrl: 'https://example.com/webhook',
      secretEncrypted: 'encrypted-secret',
      payload: {
        id: 'evt-1',
        timestamp: '2026-01-01T00:00:00.000Z',
        version: '1.0',
        tenantId: 'tenant-1',
        mid: '12345',
        event: {
          type: 'audit.event',
          actorType: 'user',
          actorId: 'user-1',
          actorEmail: 'user@example.com',
          targetId: null,
          ipAddress: null,
          metadata: null,
        },
      },
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
