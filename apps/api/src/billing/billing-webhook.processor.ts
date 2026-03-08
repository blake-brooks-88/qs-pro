import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type Stripe from 'stripe';

import { BILLING_WEBHOOK_JOB, BILLING_WEBHOOK_QUEUE } from './billing.queue';
import { WebhookHandlerService } from './webhook-handler.service';

type BillingWebhookJobData = {
  event: Stripe.Event;
};

@Injectable()
@Processor(BILLING_WEBHOOK_QUEUE, { concurrency: 10 })
export class BillingWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingWebhookProcessor.name);

  constructor(private readonly webhookHandler: WebhookHandlerService) {
    super();
  }

  async process(job: Job<BillingWebhookJobData>): Promise<void> {
    if (job.name !== BILLING_WEBHOOK_JOB) {
      this.logger.warn(`Ignoring unexpected billing webhook job: ${job.name}`);
      return;
    }

    await this.webhookHandler.process(job.data.event);
  }
}
