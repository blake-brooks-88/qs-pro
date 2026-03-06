import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import { Queue } from 'bullmq';

import { STRIPE_WEBHOOK_JOB, STRIPE_WEBHOOK_QUEUE } from './billing.constants';

interface StripeWebhookJobData {
  event: Stripe.Event;
}

@Injectable()
export class BillingWebhookQueueService {
  constructor(
    @InjectQueue(STRIPE_WEBHOOK_QUEUE)
    private readonly stripeWebhookQueue: Queue<StripeWebhookJobData>,
  ) {}

  async enqueue(event: Stripe.Event): Promise<void> {
    await this.stripeWebhookQueue.add(
      STRIPE_WEBHOOK_JOB,
      { event },
      {
        jobId: event.id,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
        removeOnComplete: {
          age: 60 * 60,
          count: 1_000,
        },
      },
    );
  }
}
