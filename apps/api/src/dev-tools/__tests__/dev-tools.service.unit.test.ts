import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import type {
  IOrgSubscriptionRepository,
  ITenantRepository,
} from '@qpp/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeaturesService } from '../../features/features.service';
import { DevToolsService } from '../dev-tools.service';

const TENANT_ID = 'tenant-1';
const TENANT_EID_TOKEN = 'enc_eid-org-1';

const mockFeatures = {
  tier: 'pro' as const,
  features: {
    basicLinting: true,
    syntaxHighlighting: true,
    quickFixes: true,
    minimap: true,
    advancedAutocomplete: true,
    teamSnippets: false,
    auditLogs: false,
  },
  trial: null,
};

function createOrgSubscriptionRepoStub(): {
  [K in keyof IOrgSubscriptionRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    findByTenantId: vi.fn(),
    findByStripeCustomerId: vi.fn(),
    upsert: vi.fn().mockResolvedValue(undefined),
    insertIfNotExists: vi.fn(),
    updateTierByTenantId: vi.fn(),
    updateFromWebhook: vi.fn().mockResolvedValue(undefined),
  };
}

function createTenantRepoStub(): {
  [K in keyof ITenantRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    findById: vi.fn(),
    findByEid: vi.fn(),
    upsert: vi.fn(),
    countUsersByTenantId: vi.fn(),
  };
}

function createConfigMock(overrides: Record<string, string> = {}) {
  return {
    get: vi.fn().mockImplementation((key: string) => overrides[key]),
  };
}

function createFeaturesServiceStub(): {
  [K in keyof FeaturesService]: ReturnType<typeof vi.fn>;
} {
  return {
    getTenantFeatures: vi.fn().mockResolvedValue(mockFeatures),
    updateTier: vi.fn(),
  };
}

function createEncryptionServiceStub() {
  return {
    encrypt: vi.fn().mockReturnValue(TENANT_EID_TOKEN),
    decrypt: vi.fn(),
  };
}

function createStripeMock() {
  return {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          url: 'https://checkout.stripe.com/session_123',
        }),
      },
    },
    subscriptions: {
      cancel: vi.fn().mockResolvedValue({ id: 'sub_123', status: 'canceled' }),
    },
  };
}

describe('DevToolsService', () => {
  let service: DevToolsService;
  let orgSubRepo: ReturnType<typeof createOrgSubscriptionRepoStub>;
  let tenantRepo: ReturnType<typeof createTenantRepoStub>;
  let configMock: ReturnType<typeof createConfigMock>;
  let featuresStub: ReturnType<typeof createFeaturesServiceStub>;
  let stripeMock: ReturnType<typeof createStripeMock>;
  let encryptionStub: ReturnType<typeof createEncryptionServiceStub>;

  beforeEach(() => {
    orgSubRepo = createOrgSubscriptionRepoStub();
    tenantRepo = createTenantRepoStub();
    configMock = createConfigMock({
      STRIPE_PRO_PRICE_ID: 'price_pro_123',
      STRIPE_ENTERPRISE_PRICE_ID: 'price_ent_456',
    });
    featuresStub = createFeaturesServiceStub();
    stripeMock = createStripeMock();
    encryptionStub = createEncryptionServiceStub();

    service = new DevToolsService(
      orgSubRepo as unknown as IOrgSubscriptionRepository,
      tenantRepo as unknown as ITenantRepository,
      stripeMock as any,
      configMock as any,
      featuresStub as unknown as FeaturesService,
      encryptionStub as any,
    );
  });

  describe('setTrialDays', () => {
    it('calls upsert with correct trialEndsAt when days is a number', async () => {
      const before = Date.now();

      const result = await service.setTrialDays(TENANT_ID, 14);

      const after = Date.now();
      expect(orgSubRepo.upsert).toHaveBeenCalledTimes(1);

      const call = orgSubRepo.upsert.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      expect(call.tenantId).toBe(TENANT_ID);
      expect(call.tier).toBe('pro');
      expect(call.stripeSubscriptionId).toBeNull();
      expect(call.stripeCustomerId).toBeNull();
      expect(call.currentPeriodEnds).toBeNull();
      expect(call.seatLimit).toBeNull();

      const expectedMin = before + 14 * 24 * 60 * 60 * 1000;
      const expectedMax = after + 14 * 24 * 60 * 60 * 1000;
      const trialEndsAt = call.trialEndsAt.getTime();
      expect(trialEndsAt).toBeGreaterThanOrEqual(expectedMin);
      expect(trialEndsAt).toBeLessThanOrEqual(expectedMax);

      expect(featuresStub.getTenantFeatures).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(mockFeatures);
    });

    it('calls updateFromWebhook with null trialEndsAt when days is null', async () => {
      const result = await service.setTrialDays(TENANT_ID, null);

      expect(orgSubRepo.updateFromWebhook).toHaveBeenCalledWith(TENANT_ID, {
        trialEndsAt: null,
      });
      expect(orgSubRepo.upsert).not.toHaveBeenCalled();
      expect(featuresStub.getTenantFeatures).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(mockFeatures);
    });
  });

  describe('createCheckout', () => {
    it('throws InternalServerErrorException when Stripe is null', async () => {
      const nullStripeService = new DevToolsService(
        orgSubRepo as unknown as IOrgSubscriptionRepository,
        tenantRepo as unknown as ITenantRepository,
        null,
        configMock as any,
        featuresStub as unknown as FeaturesService,
      );

      await expect(
        nullStripeService.createCheckout(TENANT_ID, 'pro', 'https://app.test'),
      ).rejects.toThrow(InternalServerErrorException);
      await expect(
        nullStripeService.createCheckout(TENANT_ID, 'pro', 'https://app.test'),
      ).rejects.toThrow('Stripe is not configured');
    });

    it('throws InternalServerErrorException when price ID is not configured', async () => {
      const emptyConfigMock = createConfigMock({});
      const svc = new DevToolsService(
        orgSubRepo as unknown as IOrgSubscriptionRepository,
        tenantRepo as unknown as ITenantRepository,
        stripeMock as any,
        emptyConfigMock as any,
        featuresStub as unknown as FeaturesService,
        encryptionStub as any,
      );

      await expect(
        svc.createCheckout(TENANT_ID, 'pro', 'https://app.test'),
      ).rejects.toThrow(InternalServerErrorException);
      await expect(
        svc.createCheckout(TENANT_ID, 'pro', 'https://app.test'),
      ).rejects.toThrow('Price ID not configured for tier: pro');
    });

    it('throws BadRequestException when tenant not found', async () => {
      tenantRepo.findById.mockResolvedValue(undefined);

      await expect(
        service.createCheckout(TENANT_ID, 'pro', 'https://app.test'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createCheckout(TENANT_ID, 'pro', 'https://app.test'),
      ).rejects.toThrow('Tenant not found');
    });

    it('creates checkout session with correct metadata and returns url', async () => {
      tenantRepo.findById.mockResolvedValue({
        id: TENANT_ID,
        eid: 'eid-org-1',
      });

      const result = await service.createCheckout(
        TENANT_ID,
        'pro',
        'https://app.test',
      );

      expect(encryptionStub.encrypt).toHaveBeenCalledWith('eid-org-1');
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith({
        mode: 'subscription',
        line_items: [{ price: 'price_pro_123', quantity: 1 }],
        metadata: { eid: TENANT_EID_TOKEN, tier: 'pro' },
        subscription_data: { metadata: { eid: TENANT_EID_TOKEN, tier: 'pro' } },
        success_url: 'https://app.test?checkout=success',
        cancel_url: 'https://app.test?checkout=cancel',
      });
      expect(result).toEqual({
        url: 'https://checkout.stripe.com/session_123',
      });
    });
  });

  describe('cancelSubscription', () => {
    it('throws InternalServerErrorException when Stripe is null', async () => {
      const nullStripeService = new DevToolsService(
        orgSubRepo as unknown as IOrgSubscriptionRepository,
        tenantRepo as unknown as ITenantRepository,
        null,
        configMock as any,
        featuresStub as unknown as FeaturesService,
        encryptionStub as any,
      );

      await expect(
        nullStripeService.cancelSubscription(TENANT_ID),
      ).rejects.toThrow(InternalServerErrorException);
      await expect(
        nullStripeService.cancelSubscription(TENANT_ID),
      ).rejects.toThrow('Stripe is not configured');
    });

    it('throws BadRequestException when no subscription found', async () => {
      orgSubRepo.findByTenantId.mockResolvedValue(undefined);

      await expect(service.cancelSubscription(TENANT_ID)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.cancelSubscription(TENANT_ID)).rejects.toThrow(
        'No subscription found',
      );
    });

    it('throws BadRequestException when no stripeSubscriptionId', async () => {
      orgSubRepo.findByTenantId.mockResolvedValue({
        tenantId: TENANT_ID,
        stripeSubscriptionId: null,
      });

      await expect(service.cancelSubscription(TENANT_ID)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.cancelSubscription(TENANT_ID)).rejects.toThrow(
        'No active Stripe subscription',
      );
    });

    it('calls stripe.subscriptions.cancel and returns { canceled: true }', async () => {
      orgSubRepo.findByTenantId.mockResolvedValue({
        tenantId: TENANT_ID,
        stripeSubscriptionId: 'sub_abc',
      });

      const result = await service.cancelSubscription(TENANT_ID);

      expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith('sub_abc');
      expect(result).toEqual({ canceled: true });
    });
  });

  describe('resetToFree', () => {
    it('calls upsert with tier free and null fields, returns features', async () => {
      const result = await service.resetToFree(TENANT_ID);

      expect(orgSubRepo.upsert).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        tier: 'free',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        trialEndsAt: null,
        currentPeriodEnds: null,
        seatLimit: null,
      });
      expect(featuresStub.getTenantFeatures).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(mockFeatures);
    });
  });
});
