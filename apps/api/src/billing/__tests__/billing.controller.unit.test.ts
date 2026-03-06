import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EncryptionService } from '@qpp/backend-shared';
import { AppError, ErrorCode } from '@qpp/backend-shared';
import type { ITenantRepository } from '@qpp/database';
import type { FastifyRequest } from 'fastify';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BillingWebhookQueueService } from '../billing-webhook-queue.service';
import { BillingController } from '../billing.controller';

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

function createWebhookQueueMock(): {
  enqueue: ReturnType<typeof vi.fn>;
} {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
  };
}

function createEncryptionServiceMock() {
  return { encrypt: vi.fn(), decrypt: vi.fn() };
}

function createTenantRepoMock() {
  return {
    findById: vi.fn(),
    findByEid: vi.fn(),
    upsert: vi.fn(),
    countUsersByTenantId: vi.fn(),
  };
}

function createReq(rawBody?: string) {
  return { rawBody } as unknown as FastifyRequest & { rawBody?: string };
}

describe('BillingController', () => {
  let controller: BillingController;
  let stripeMock: ReturnType<typeof createStripeMock>;
  let configMock: ReturnType<typeof createConfigMock>;
  let queueMock: ReturnType<typeof createWebhookQueueMock>;

  beforeEach(() => {
    stripeMock = createStripeMock();
    configMock = createConfigMock();
    queueMock = createWebhookQueueMock();

    controller = new BillingController(
      stripeMock as unknown as Stripe,
      configMock as unknown as ConfigService,
      queueMock as unknown as BillingWebhookQueueService,
      createEncryptionServiceMock() as unknown as EncryptionService,
      createTenantRepoMock() as unknown as ITenantRepository,
    );
  });

  describe('handleWebhook', () => {
    it('returns 503 when Stripe client is null', async () => {
      const nullStripeController = new BillingController(
        null,
        configMock as unknown as ConfigService,
        queueMock as unknown as BillingWebhookQueueService,
        createEncryptionServiceMock() as unknown as EncryptionService,
        createTenantRepoMock() as unknown as ITenantRepository,
      );

      await expect(
        nullStripeController.handleWebhook(createReq('body'), 'sig_test'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws validation error when rawBody is missing', async () => {
      await expect(
        controller.handleWebhook(createReq(undefined), 'sig_test'),
      ).rejects.toThrow(AppError);

      try {
        await controller.handleWebhook(createReq(undefined), 'sig_test');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCode.VALIDATION_ERROR);
      }
    });

    it('throws unauthorized error when signature is empty', async () => {
      await expect(
        controller.handleWebhook(createReq('body'), ''),
      ).rejects.toThrow(AppError);

      try {
        await controller.handleWebhook(createReq('body'), '');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCode.AUTH_UNAUTHORIZED);
      }
    });

    it('throws unauthorized when signature verification fails', async () => {
      stripeMock.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Signature verification failed');
      });

      await expect(
        controller.handleWebhook(createReq('body'), 'bad_sig'),
      ).rejects.toThrow(AppError);

      try {
        await controller.handleWebhook(createReq('body'), 'bad_sig');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCode.AUTH_UNAUTHORIZED);
      }
    });

    it('returns { received: true } on successful processing', async () => {
      const result = await controller.handleWebhook(
        createReq('body'),
        'sig_test',
      );

      expect(result).toEqual({ received: true });
    });

    it('calls constructEvent with rawBody, signature, and webhook secret', async () => {
      await controller.handleWebhook(
        createReq('raw_body_content'),
        'sig_value',
      );

      expect(stripeMock.webhooks.constructEvent).toHaveBeenCalledWith(
        'raw_body_content',
        'sig_value',
        'whsec_test_secret',
      );
    });

    it('queues the constructed event for asynchronous processing', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: 'checkout.session.completed',
        data: { object: {} },
      } as unknown as Stripe.Event;
      stripeMock.webhooks.constructEvent.mockReturnValue(mockEvent);

      await controller.handleWebhook(createReq('body'), 'sig_test');

      expect(queueMock.enqueue).toHaveBeenCalledWith(mockEvent);
    });

    it('propagates errors from webhook queueing', async () => {
      queueMock.enqueue.mockRejectedValue(new Error('Queue failed'));

      await expect(
        controller.handleWebhook(createReq('body'), 'sig_test'),
      ).rejects.toThrow('Queue failed');
    });
  });
});
