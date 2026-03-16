import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import type { SiemWebhookJobData } from './siem.types';

@Injectable()
export class SiemWebhookProducer {
  private readonly logger = new Logger(SiemWebhookProducer.name);

  constructor(@InjectQueue('siem-webhook') private readonly siemQueue: Queue) {}

  async enqueue(jobData: SiemWebhookJobData): Promise<void> {
    await this.siemQueue.add('deliver-webhook', jobData, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });
    this.logger.debug(
      `Enqueued SIEM webhook delivery for tenant ${jobData.tenantId}`,
    );
  }
}
