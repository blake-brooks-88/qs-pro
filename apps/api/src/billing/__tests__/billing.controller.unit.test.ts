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
    getPrices: vi.fn().mockResolvedValue({
      pro: { monthly: 29, annual: 24.17 },
    }),
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
  let billingServiceMock: ReturnType<typeof createBillingServiceMock>;

  beforeEach(() => {
    stripeMock = createStripeMock();
    configMock = createConfigMock();
    queueMock = createQueueMock();
    billingServiceMock = createBillingServiceMock();

    controller = new BillingController(
      stripeMock as unknown as Stripe,
      queueMock as unknown as Queue,
      configMock as unknown as ConfigService,
      billingServiceMock as unknown as BillingService,
    );
  });

  describe('billing endpoints', () => {
    it('returns prices from the billing service', async () => {
      const result = await controller.getPrices();

      expect(result).toEqual({
        pro: { monthly: 29, annual: 24.17 },
      });
      expect(billingServiceMock.getPrices).toHaveBeenCalled();
    });

    it('creates a checkout session for the current tenant', async () => {
      billingServiceMock.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/session',
      });

      const result = await controller.createCheckout(
        { tenantId: 'tenant-1' } as never,
        { tier: 'pro', interval: 'monthly' },
      );

      expect(result).toEqual({
        url: 'https://checkout.stripe.com/session',
      });
      expect(billingServiceMock.createCheckoutSession).toHaveBeenCalledWith(
        'tenant-1',
        'pro',
        'monthly',
      );
    });

    it('creates a portal session for the current tenant', async () => {
      billingServiceMock.createPortalSession.mockResolvedValue({
        url: 'https://billing.stripe.com/session',
      });

      const result = await controller.createPortal({
        tenantId: 'tenant-1',
      } as never);

      expect(result).toEqual({
        url: 'https://billing.stripe.com/session',
      });
      expect(billingServiceMock.createPortalSession).toHaveBeenCalledWith(
        'tenant-1',
      );
    });

    it('confirms a checkout session for the current tenant', async () => {
      billingServiceMock.confirmCheckoutSession.mockResolvedValue({
        status: 'fulfilled',
      });

      const result = await controller.confirmCheckoutSession(
        { tenantId: 'tenant-1' } as never,
        'cs_test_123',
      );

      expect(result).toEqual({ status: 'fulfilled' });
      expect(billingServiceMock.confirmCheckoutSession).toHaveBeenCalledWith(
        'tenant-1',
        'cs_test_123',
      );
    });
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

    it('enqueues the constructed event for async processing', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: 'checkout.session.completed',
        data: { object: {} },
      } as unknown as Stripe.Event;
      stripeMock.webhooks.constructEvent.mockReturnValue(mockEvent);

      await controller.handleWebhook(createReq('body'), 'sig_test');

      expect(queueMock.add).toHaveBeenCalledWith(
        'process-stripe-webhook',
        { event: mockEvent },
        expect.objectContaining({ jobId: 'evt_123' }),
      );
    });

    it('propagates errors from queue enqueue', async () => {
      queueMock.add.mockRejectedValue(new Error('Queue failed'));

      await expect(
        controller.handleWebhook(createReq('body'), 'sig_test'),
      ).rejects.toThrow('Queue failed');
    });
  });
});
