import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '@qpp/backend-shared';
import type {
  IOrgSubscriptionRepository,
  ITenantRepository,
} from '@qpp/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BillingService } from '../billing.service';

function createMockStripe() {
  return {
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
    prices: {
      list: vi.fn(),
    },
  };
}

function createMockTenantRepo(): ITenantRepository {
  return {
    findById: vi.fn(),
    findByEid: vi.fn(),
    create: vi.fn(),
  } as unknown as ITenantRepository;
}

function createMockOrgSubscriptionRepo(): IOrgSubscriptionRepository {
  return {
    findByTenantId: vi.fn(),
    upsert: vi.fn(),
    updateFromWebhook: vi.fn(),
    updateTierByTenantId: vi.fn(),
  } as unknown as IOrgSubscriptionRepository;
}

describe('BillingService', () => {
  let service: BillingService;
  let stripe: ReturnType<typeof createMockStripe>;
  let configService: ConfigService;
  let tenantRepo: ITenantRepository;
  let orgSubscriptionRepo: IOrgSubscriptionRepository;
  let encryptionService: EncryptionService;

  beforeEach(() => {
    stripe = createMockStripe();
    configService = {
      getOrThrow: vi.fn().mockReturnValue('http://localhost:5173'),
    } as unknown as ConfigService;
    tenantRepo = createMockTenantRepo();
    orgSubscriptionRepo = createMockOrgSubscriptionRepo();
    encryptionService = {
      encrypt: vi.fn().mockReturnValue('encrypted-eid'),
    } as unknown as EncryptionService;

    service = new BillingService(
      stripe as never,
      configService,
      tenantRepo,
      orgSubscriptionRepo,
      encryptionService,
    );
  });

  describe('createCheckoutSession', () => {
    it('creates session with monthly interval using pro_monthly lookup key', async () => {
      stripe.prices.list.mockResolvedValue({
        data: [{ id: 'price_monthly_123' }],
      });
      vi.mocked(tenantRepo.findById).mockResolvedValue({
        id: 'tenant-1',
        eid: 'eid-123',
      } as never);
      stripe.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/session-1',
      });

      const result = await service.createCheckoutSession(
        'tenant-1',
        'pro',
        'monthly',
      );

      expect(stripe.prices.list).toHaveBeenCalledWith({
        lookup_keys: ['pro_monthly'],
        active: true,
        limit: 1,
      });
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          line_items: [{ price: 'price_monthly_123', quantity: 1 }],
          metadata: { eid: 'encrypted-eid', tier: 'pro' },
          success_url: 'http://localhost:5173/?checkout=success',
          cancel_url: 'http://localhost:5173/?checkout=cancel',
          allow_promotion_codes: true,
          custom_fields: [
            {
              key: 'purchase_order',
              label: { type: 'custom', custom: 'Purchase Order Number' },
              type: 'text',
              optional: true,
            },
          ],
        }),
      );
      expect(result).toEqual({ url: 'https://checkout.stripe.com/session-1' });
    });

    it('creates session with annual interval using pro_annual lookup key', async () => {
      stripe.prices.list.mockResolvedValue({
        data: [{ id: 'price_annual_456' }],
      });
      vi.mocked(tenantRepo.findById).mockResolvedValue({
        id: 'tenant-1',
        eid: 'eid-123',
      } as never);
      stripe.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/session-2',
      });

      await service.createCheckoutSession('tenant-1', 'pro', 'annual');

      expect(stripe.prices.list).toHaveBeenCalledWith({
        lookup_keys: ['pro_annual'],
        active: true,
        limit: 1,
      });
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: 'price_annual_456', quantity: 1 }],
        }),
      );
    });

    it('creates session with enterprise_monthly lookup key for enterprise tier', async () => {
      stripe.prices.list.mockResolvedValue({
        data: [{ id: 'price_enterprise_monthly_789' }],
      });
      vi.mocked(tenantRepo.findById).mockResolvedValue({
        id: 'tenant-1',
        eid: 'eid-123',
      } as never);
      stripe.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/session-3',
      });

      await service.createCheckoutSession('tenant-1', 'enterprise', 'monthly');

      expect(stripe.prices.list).toHaveBeenCalledWith({
        lookup_keys: ['enterprise_monthly'],
        active: true,
        limit: 1,
      });
    });

    it('throws ServiceUnavailableException when stripe is null', async () => {
      const serviceNoStripe = new BillingService(
        null,
        configService,
        tenantRepo,
        orgSubscriptionRepo,
        encryptionService,
      );

      await expect(
        serviceNoStripe.createCheckoutSession('tenant-1', 'pro', 'monthly'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws BadRequestException when tenant not found', async () => {
      stripe.prices.list.mockResolvedValue({
        data: [{ id: 'price_123' }],
      });
      vi.mocked(tenantRepo.findById).mockResolvedValue(null as never);

      await expect(
        service.createCheckoutSession('tenant-1', 'pro', 'monthly'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createPortalSession', () => {
    it('creates portal session when stripeCustomerId exists', async () => {
      vi.mocked(orgSubscriptionRepo.findByTenantId).mockResolvedValue({
        stripeCustomerId: 'cus_123',
      } as never);
      stripe.billingPortal.sessions.create.mockResolvedValue({
        url: 'https://billing.stripe.com/portal-1',
      });

      const result = await service.createPortalSession('tenant-1');

      expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: 'http://localhost:5173/',
      });
      expect(result).toEqual({
        url: 'https://billing.stripe.com/portal-1',
      });
    });

    it('throws BadRequestException when no subscription found', async () => {
      vi.mocked(orgSubscriptionRepo.findByTenantId).mockResolvedValue(
        null as never,
      );

      await expect(service.createPortalSession('tenant-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when no stripeCustomerId', async () => {
      vi.mocked(orgSubscriptionRepo.findByTenantId).mockResolvedValue({
        stripeCustomerId: null,
      } as never);

      await expect(service.createPortalSession('tenant-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ServiceUnavailableException when stripe is null', async () => {
      const serviceNoStripe = new BillingService(
        null,
        configService,
        tenantRepo,
        orgSubscriptionRepo,
        encryptionService,
      );

      await expect(
        serviceNoStripe.createPortalSession('tenant-1'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('price cache', () => {
    it('uses cached price on second call', async () => {
      stripe.prices.list.mockResolvedValue({
        data: [{ id: 'price_cached' }],
      });
      vi.mocked(tenantRepo.findById).mockResolvedValue({
        id: 'tenant-1',
        eid: 'eid-123',
      } as never);
      stripe.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/s',
      });

      await service.createCheckoutSession('tenant-1', 'pro', 'monthly');
      await service.createCheckoutSession('tenant-1', 'pro', 'monthly');

      expect(stripe.prices.list).toHaveBeenCalledTimes(1);
    });
  });
});
