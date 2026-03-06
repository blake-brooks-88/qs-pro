import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type Stripe from 'stripe';

import { STRIPE_WEBHOOK_JOB, STRIPE_WEBHOOK_QUEUE } from './billing.constants';
import { WebhookHandlerService } from './webhook-handler.service';

interface StripeWebhookJobData {
  event: Stripe.Event;
}

@Processor(STRIPE_WEBHOOK_QUEUE, {
  concurrency: 10,
  lockDuration: 300_000,
})
export class BillingWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingWebhookProcessor.name);

  constructor(private readonly webhookHandler: WebhookHandlerService) {
    super();
  }

  async process(job: Job<StripeWebhookJobData>): Promise<void> {
    if (job.name !== STRIPE_WEBHOOK_JOB) {
      this.logger.warn(`Unknown Stripe webhook job type: ${job.name}`);
      return;
    }

    await this.webhookHandler.process(job.data.event);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<StripeWebhookJobData>, error: Error): void {
    this.logger.error(
      `Stripe webhook job failed (${job.id ?? 'unknown'}): ${error.message}`,
      error.stack,
    );
  }
}
