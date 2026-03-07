import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BILLING_WEBHOOK_JOB } from '../billing.queue';
import { BillingWebhookProcessor } from '../billing-webhook.processor';

describe('BillingWebhookProcessor', () => {
  let webhookHandler: { process: ReturnType<typeof vi.fn> };
  let processor: BillingWebhookProcessor;

  beforeEach(() => {
    webhookHandler = {
      process: vi.fn().mockResolvedValue(undefined),
    };
    processor = new BillingWebhookProcessor(webhookHandler as never);
  });

  it('forwards supported jobs to the webhook handler', async () => {
    const event = { id: 'evt_1', type: 'checkout.session.completed' };

    await processor.process({
      name: BILLING_WEBHOOK_JOB,
      data: { event },
    } as never);

    expect(webhookHandler.process).toHaveBeenCalledWith(event);
  });

  it('ignores unexpected jobs without calling the handler', async () => {
    const warnSpy = vi
      .spyOn(processor['logger'], 'warn')
      .mockImplementation(() => undefined);

    await processor.process({
      name: 'unexpected-job',
      data: { event: { id: 'evt_2' } },
    } as never);

    expect(webhookHandler.process).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'Ignoring unexpected billing webhook job: unexpected-job',
    );
  });
});
