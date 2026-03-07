import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AppError, ErrorCode } from '@qpp/backend-shared';
import type { Queue } from 'bullmq';
import type { FastifyRequest } from 'fastify';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BillingController } from '../billing.controller';
import type { BillingService } from '../billing.service';

function createStripeMock() {
  return {
    webhooks: {
      constructEvent: vi.fn().mockReturnValue({
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: { object: {} },
      } as unknown as Stripe.Event),
    },
  };
}

function createConfigMock() {
  return {
    get: vi.fn(),
    getOrThrow: vi.fn().mockReturnValue('whsec_test_secret'),
  };
}

function createQueueMock(): { add: ReturnType<typeof vi.fn> } {
  return {
    add: vi.fn().mockResolvedValue(undefined),
  };
}

function createBillingServiceMock() {
  return {
    getPrices: vi.fn(),
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    confirmCheckoutSession: vi.fn(),
  };
}

function createReq(rawBody?: string) {
  return { rawBody } as unknown as FastifyRequest & { rawBody?: string };
}

describe('BillingController', () => {
  let controller: BillingController;
  let stripeMock: ReturnType<typeof createStripeMock>;
  let configMock: ReturnType<typeof createConfigMock>;
  let queueMock: ReturnType<typeof createQueueMock>;

  beforeEach(() => {
    stripeMock = createStripeMock();
    configMock = createConfigMock();
    queueMock = createQueueMock();

    controller = new BillingController(
      stripeMock as unknown as Stripe,
      queueMock as unknown as Queue,
      configMock as unknown as ConfigService,
      createBillingServiceMock() as unknown as BillingService,
    );
  });

  describe('handleWebhook', () => {
    it('returns 503 when Stripe client is null', async () => {
      const nullStripeController = new BillingController(
        null,
        queueMock as unknown as Queue,
        configMock as unknown as ConfigService,
        createBillingServiceMock() as unknown as BillingService,
      );

      await expect(
        nullStripeController.handleWebhook(createReq('body'), 'sig_test'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws validation error when rawBody is missing', async () => {
      const error = await controller
        .handleWebhook(createReq(undefined), 'sig_test')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('throws unauthorized error when signature is empty', async () => {
      const error = await controller
        .handleWebhook(createReq('body'), '')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.AUTH_UNAUTHORIZED);
    });

    it('throws unauthorized when signature verification fails', async () => {
      stripeMock.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Signature verification failed');
      });

      const error = await controller
        .handleWebhook(createReq('body'), 'bad_sig')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.AUTH_UNAUTHORIZED);
    });

    it('returns { received: true } on successful processing', async () => {
      const result = await controller.handleWebhook(
        createReq('body'),
        'sig_test',
      );

      expect(result).toEqual({ received: true });
      expect(queueMock.add).toHaveBeenCalledWith(
        'process-stripe-webhook',
        expect.objectContaining({
          event: expect.objectContaining({ id: 'evt_test' }),
        }),
        expect.objectContaining({
          jobId: 'evt_test',
          attempts: 8,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }),
      );
    });

    it('acknowledges duplicate webhook delivery when enqueue reports job already exists', async () => {
      queueMock.add.mockRejectedValueOnce(
        new Error('Job evt_test already exists'),
      );

      await expect(
        controller.handleWebhook(createReq('body'), 'sig_test'),
      ).resolves.toEqual({ received: true });
    });

    it('bubbles enqueue errors so Stripe retries delivery', async () => {
      queueMock.add.mockRejectedValueOnce(new Error('Redis connection lost'));

      await expect(
        controller.handleWebhook(createReq('body'), 'sig_test'),
      ).rejects.toThrow('Redis connection lost');
    });
  });
});
