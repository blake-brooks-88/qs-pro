import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as backendShared from '@qpp/backend-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@qpp/backend-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qpp/backend-shared')>();
  return {
    ...actual,
    getReservedSqlFromContext: vi.fn(),
  };
});

import { BillingService } from '../billing.service';

const mockedGetReservedSqlFromContext = vi.mocked(
  backendShared.getReservedSqlFromContext,
);

function createConfigMock() {
  return {
    getOrThrow: vi.fn().mockReturnValue('https://app.example.com'),
  };
}

function createStripeMock() {
  return {
    prices: {
      list: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
  };
}

describe('BillingService', () => {
  let stripeMock: ReturnType<typeof createStripeMock>;
  let tenantRepo: { findById: ReturnType<typeof vi.fn> };
  let orgSubscriptionRepo: { findByTenantId: ReturnType<typeof vi.fn> };
  let stripeCheckoutSessionRepo: {
    findByTenantId: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    markFailed: ReturnType<typeof vi.fn>;
    markCompleted: ReturnType<typeof vi.fn>;
    markExpired: ReturnType<typeof vi.fn>;
  };
  let encryptionService: { encrypt: ReturnType<typeof vi.fn>; decrypt: ReturnType<typeof vi.fn> };
  let rlsContext: {
    runWithTenantContext: ReturnType<typeof vi.fn>;
    runWithIsolatedTenantContext: ReturnType<typeof vi.fn>;
  };
  let webhookHandler: { process: ReturnType<typeof vi.fn> };
  let service: BillingService;

  beforeEach(() => {
    stripeMock = createStripeMock();
    tenantRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'tenant-1',
        eid: 'eid-1',
      }),
    };
    orgSubscriptionRepo = {
      findByTenantId: vi.fn().mockResolvedValue(undefined),
    };
    stripeCheckoutSessionRepo = {
      findByTenantId: vi.fn().mockResolvedValue(undefined),
      upsert: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
      markCompleted: vi.fn().mockResolvedValue(undefined),
      markExpired: vi.fn().mockResolvedValue(undefined),
    };
    encryptionService = {
      encrypt: vi.fn().mockReturnValue('encrypted-eid'),
      decrypt: vi.fn().mockReturnValue('eid-1'),
    };
    rlsContext = {
      runWithTenantContext: vi.fn().mockImplementation((_tenantId, _mid, fn) => fn()),
      runWithIsolatedTenantContext: vi.fn().mockImplementation(
        (_tenantId, _mid, fn) => fn(),
      ),
    };
    webhookHandler = {
      process: vi.fn().mockResolvedValue(undefined),
    };
    mockedGetReservedSqlFromContext.mockReset();
    mockedGetReservedSqlFromContext.mockReturnValue(
      vi.fn().mockResolvedValue(undefined) as never,
    );

    service = new BillingService(
      stripeMock as never,
      createConfigMock() as unknown as ConfigService,
      tenantRepo as never,
      orgSubscriptionRepo as never,
      stripeCheckoutSessionRepo as never,
      encryptionService as never,
      rlsContext as never,
      webhookHandler as never,
    );
  });

  describe('getPrices', () => {
    it('returns normalized prices and caches the Stripe response', async () => {
      stripeMock.prices.list.mockResolvedValue({
        data: [
          {
            lookup_key: 'pro_monthly',
            unit_amount: 2900,
            recurring: { interval: 'month' },
          },
          {
            lookup_key: 'pro_annual',
            unit_amount: 24000,
            recurring: { interval: 'year' },
          },
        ],
      });

      const first = await service.getPrices();
      const second = await service.getPrices();

      expect(first).toEqual({
        pro: { monthly: 29, annual: 20 },
      });
      expect(second).toEqual(first);
      expect(stripeMock.prices.list).toHaveBeenCalledTimes(1);
    });

    it('throws when Stripe is not configured', async () => {
      const unavailableService = new BillingService(
        null,
        createConfigMock() as unknown as ConfigService,
        tenantRepo as never,
        orgSubscriptionRepo as never,
        stripeCheckoutSessionRepo as never,
        encryptionService as never,
        rlsContext as never,
        webhookHandler as never,
      );

      await expect(unavailableService.getPrices()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws when required Pro prices are missing', async () => {
      stripeMock.prices.list.mockResolvedValue({
        data: [
          {
            lookup_key: 'pro_monthly',
            unit_amount: 2900,
            recurring: { interval: 'month' },
          },
        ],
      });

      await expect(service.getPrices()).rejects.toThrow(
        'Required Pro prices not found in Stripe',
      );
    });
  });

  describe('createCheckoutSession', () => {
    it('reuses an existing open checkout session when it is still valid', async () => {
      stripeCheckoutSessionRepo.findByTenantId.mockResolvedValue({
        tenantId: 'tenant-1',
        idempotencyKey: 'checkout:tenant-1:existing',
        sessionId: 'cs_existing',
        sessionUrl: 'https://checkout.stripe.com/existing',
        tier: 'pro',
        interval: 'monthly',
        status: 'open',
        expiresAt: new Date('2026-04-01T00:00:00.000Z'),
      });
      stripeMock.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_existing',
        status: 'open',
        expires_at: Math.floor(Date.now() / 1000) + 1800,
      });

      const result = await service.createCheckoutSession(
        'tenant-1',
        'pro',
        'monthly',
      );

      expect(result).toEqual({
        url: 'https://checkout.stripe.com/existing',
      });
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('marks checkout creation as failed when Stripe omits required fields', async () => {
      stripeMock.prices.list.mockResolvedValue({
        data: [
          {
            id: 'price_pro_monthly',
            lookup_key: 'pro_monthly',
            unit_amount: 2900,
            recurring: { interval: 'month' },
          },
        ],
      });
      stripeMock.checkout.sessions.create.mockResolvedValue({
        id: null,
        url: null,
        expires_at: null,
      });

      await expect(
        service.createCheckoutSession('tenant-1', 'pro', 'monthly'),
      ).rejects.toThrow('Stripe checkout session missing required fields');

      expect(stripeCheckoutSessionRepo.markFailed).toHaveBeenCalledWith(
        'tenant-1',
        'Stripe checkout session missing required fields',
      );
    });

    it('throws when the reserved SQL context is missing', async () => {
      mockedGetReservedSqlFromContext.mockReturnValue(undefined);

      await expect(
        service.createCheckoutSession('tenant-1', 'pro', 'monthly'),
      ).rejects.toThrow('Missing reserved SQL context for checkout creation');
    });

    it('throws when the tenant id in the checkout session does not match', async () => {
      stripeMock.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_other_tenant',
        metadata: { eid: 'encrypted-other' },
      });
      encryptionService.decrypt.mockReturnValue('eid-other');

      await expect(
        service.confirmCheckoutSession('tenant-1', 'cs_other_tenant'),
      ).rejects.toThrow('Checkout session does not belong to this tenant');
    });
  });

  describe('confirmCheckoutSession', () => {
    it('returns expired when the checkout session has expired', async () => {
      stripeMock.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_expired',
        status: 'expired',
        expires_at: Math.floor(Date.now() / 1000) - 5,
        metadata: { eid: 'encrypted-eid' },
      });

      await expect(
        service.confirmCheckoutSession('tenant-1', 'cs_expired'),
      ).resolves.toEqual({
        status: 'failed',
        reason: 'expired',
      });
    });

    it('reconciles a fulfilled checkout by delegating to the webhook handler', async () => {
      stripeMock.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_paid',
        status: 'complete',
        payment_status: 'paid',
        metadata: { eid: 'encrypted-eid' },
      });

      await expect(
        service.confirmCheckoutSession('tenant-1', 'cs_paid'),
      ).resolves.toEqual({
        status: 'fulfilled',
      });

      expect(webhookHandler.process).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'evt_reconcile_checkout_cs_paid',
          type: 'checkout.session.completed',
        }),
      );
      expect(stripeCheckoutSessionRepo.markCompleted).toHaveBeenCalledWith(
        'cs_paid',
      );
    });

    it('returns pending for an incomplete checkout session', async () => {
      stripeMock.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_pending',
        status: 'open',
        payment_status: 'unpaid',
        expires_at: Math.floor(Date.now() / 1000) + 30,
        metadata: { eid: 'encrypted-eid' },
      });

      await expect(
        service.confirmCheckoutSession('tenant-1', 'cs_pending'),
      ).resolves.toEqual({
        status: 'pending',
      });
    });
  });
});
