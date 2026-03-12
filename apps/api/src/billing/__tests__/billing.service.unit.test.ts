import { ServiceUnavailableException } from '@nestjs/common';
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
  let encryptionService: {
    encrypt: ReturnType<typeof vi.fn>;
    decrypt: ReturnType<typeof vi.fn>;
  };
  let rlsContext: {
    runWithTenantContext: ReturnType<typeof vi.fn>;
    runWithIsolatedTenantContext: ReturnType<typeof vi.fn>;
  };
  let stripeCatalog: {
    getPublicPrices: ReturnType<typeof vi.fn>;
    resolveCheckoutPriceId: ReturnType<typeof vi.fn>;
  };
  let webhookHandler: { process: ReturnType<typeof vi.fn> };
  let service: BillingService;

  beforeEach(() => {
    stripeMock = createStripeMock();
    tenantRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'tenant-1',
        eid: 'test---billing-unit',
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
      encrypt: vi.fn().mockReturnValue('test---billing-unit-encrypted'),
      decrypt: vi.fn().mockReturnValue('eid-1'),
    };
    rlsContext = {
      runWithTenantContext: vi
        .fn()
        .mockImplementation((_tenantId, _mid, fn) => fn()),
      runWithIsolatedTenantContext: vi
        .fn()
        .mockImplementation((_tenantId, _mid, fn) => fn()),
    };
    stripeCatalog = {
      getPublicPrices: vi.fn().mockResolvedValue({
        monthly: {
          id: 'price_pro_monthly_test',
          unitAmount: 2900,
          recurringInterval: 'month',
        },
        annual: {
          id: 'price_pro_annual_test',
          unitAmount: 24000,
          recurringInterval: 'year',
        },
      }),
      resolveCheckoutPriceId: vi
        .fn()
        .mockResolvedValue('price_pro_monthly_test'),
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
      stripeCatalog as never,
      webhookHandler as never,
    );
  });

  describe('getPrices', () => {
    it('returns normalized prices and caches the Stripe response', async () => {
      const first = await service.getPrices();
      const second = await service.getPrices();

      expect(first).toEqual({
        pro: { monthly: 29, annual: 20 },
      });
      expect(second).toEqual(first);
      expect(stripeCatalog.getPublicPrices).toHaveBeenCalledTimes(1);
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
        stripeCatalog as never,
        webhookHandler as never,
      );

      await expect(unavailableService.getPrices()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws when required Pro prices are missing', async () => {
      stripeCatalog.getPublicPrices.mockResolvedValue({
        monthly: {
          id: 'price_pro_monthly_test',
          unitAmount: 2900,
          recurringInterval: 'month',
        },
        annual: {
          id: 'price_pro_annual_test',
          unitAmount: null,
          recurringInterval: 'year',
        },
      });

      await expect(service.getPrices()).rejects.toThrow(
        'Required Pro prices not found in Stripe',
      );
    });
  });

  describe('confirmCheckoutSession', () => {
    it('returns expired when the checkout session has expired', async () => {
      stripeMock.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_expired',
        status: 'expired',
        expires_at: Math.floor(Date.now() / 1000) - 5,
        metadata: { eid: 'test---billing-unit-encrypted' },
      });

      await expect(
        service.confirmCheckoutSession('tenant-1', 'cs_expired'),
      ).resolves.toEqual({
        status: 'failed',
        reason: 'expired',
      });
    });

    it('returns pending for an incomplete checkout session', async () => {
      stripeMock.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_pending',
        status: 'open',
        payment_status: 'unpaid',
        expires_at: Math.floor(Date.now() / 1000) + 30,
        metadata: { eid: 'test---billing-unit-encrypted' },
      });

      await expect(
        service.confirmCheckoutSession('tenant-1', 'cs_pending'),
      ).resolves.toEqual({
        status: 'pending',
      });
    });
  });

  describe('createCheckoutSession', () => {
    it('reconciles a completed checkout before plan matching and blocks duplicate paid checkouts', async () => {
      const paidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      orgSubscriptionRepo.findByTenantId
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          tenantId: 'tenant-1',
          tier: 'pro',
          stripeCustomerId: 'cus_paid',
          stripeSubscriptionId: 'sub_paid',
          stripeSubscriptionStatus: 'active',
          currentPeriodEnds: paidUntil,
          lastInvoicePaidAt: new Date(),
        });
      stripeCheckoutSessionRepo.findByTenantId.mockResolvedValue({
        tenantId: 'tenant-1',
        tier: 'pro',
        interval: 'monthly',
        status: 'open',
        sessionId: 'cs_existing',
      });
      stripeMock.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_existing',
        status: 'complete',
        payment_status: 'paid',
      });

      await expect(
        service.createCheckoutSession('tenant-1', 'pro', 'annual'),
      ).rejects.toThrow(
        'An active paid subscription already exists for this tenant',
      );

      expect(stripeMock.checkout.sessions.retrieve).toHaveBeenCalledWith(
        'cs_existing',
      );
      expect(webhookHandler.process).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'checkout.session.completed',
          data: expect.objectContaining({
            object: expect.objectContaining({ id: 'cs_existing' }),
          }),
        }),
      );
    });

    it('resolves the checkout price id server-side', async () => {
      stripeMock.checkout.sessions.create.mockResolvedValue({
        id: 'cs_new',
        url: 'https://checkout.stripe.com/test-session',
        expires_at: Math.floor(Date.now() / 1000) + 1800,
      });

      await service.createCheckoutSession('tenant-1', 'pro', 'monthly');

      expect(stripeCatalog.resolveCheckoutPriceId).toHaveBeenCalledWith(
        'pro',
        'monthly',
      );
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: 'price_pro_monthly_test', quantity: 1 }],
        }),
        expect.any(Object),
      );
    });
  });
});
