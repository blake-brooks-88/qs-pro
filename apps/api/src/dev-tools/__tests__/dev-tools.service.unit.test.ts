import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import type {
  IOrgSubscriptionRepository,
  IStripeBillingBindingRepository,
  IStripeCheckoutSessionRepository,
} from '@qpp/database';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BillingService } from '../../billing/billing.service';
import type { WebhookHandlerService } from '../../billing/webhook-handler.service';
import type { FeaturesService } from '../../features/features.service';
import { DevToolsService } from '../dev-tools.service';

const TENANT_ID = 'tenant-1';

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
    upsert: vi.fn().mockResolvedValue(undefined),
    insertIfNotExists: vi.fn(),
    startTrialIfEligible: vi.fn(),
    updateTierByTenantId: vi.fn(),
    updateFromWebhook: vi.fn().mockResolvedValue(undefined),
  };
}

function createStripeBindingRepoStub(): {
  [K in keyof IStripeBillingBindingRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    findByTenantId: vi.fn(),
    findByStripeCustomerId: vi.fn(),
    findByStripeSubscriptionId: vi.fn(),
    upsert: vi.fn().mockResolvedValue(undefined),
    clearSubscription: vi.fn().mockResolvedValue(undefined),
    deleteByTenantId: vi.fn().mockResolvedValue(undefined),
  };
}

function createStripeCheckoutSessionRepoStub(): {
  [K in keyof IStripeCheckoutSessionRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    findByTenantId: vi.fn(),
    upsert: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markExpired: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    deleteByTenantId: vi.fn().mockResolvedValue(undefined),
  };
}

function createFeaturesServiceStub(): {
  getTenantFeatures: ReturnType<typeof vi.fn>;
} {
  return {
    getTenantFeatures: vi.fn().mockResolvedValue(mockFeatures),
  };
}

function createBillingServiceStub() {
  return {
    createCheckoutSession: vi
      .fn()
      .mockResolvedValue({ url: 'https://checkout.stripe.com/session_123' }),
    createPortalSession: vi.fn(),
  };
}

function createStripeMock() {
  return {
    subscriptions: {
      cancel: vi.fn().mockResolvedValue({ id: 'sub_123', status: 'canceled' }),
    },
  };
}

function createWebhookHandlerStub() {
  return {
    process: vi.fn().mockResolvedValue(undefined),
  };
}

describe('DevToolsService', () => {
  let service: DevToolsService;
  let orgSubRepo: ReturnType<typeof createOrgSubscriptionRepoStub>;
  let stripeBindingRepo: ReturnType<typeof createStripeBindingRepoStub>;
  let stripeCheckoutSessionRepo: ReturnType<
    typeof createStripeCheckoutSessionRepoStub
  >;
  let featuresStub: ReturnType<typeof createFeaturesServiceStub>;
  let billingStub: ReturnType<typeof createBillingServiceStub>;
  let stripeMock: ReturnType<typeof createStripeMock>;
  let webhookHandlerStub: ReturnType<typeof createWebhookHandlerStub>;

  beforeEach(() => {
    orgSubRepo = createOrgSubscriptionRepoStub();
    stripeBindingRepo = createStripeBindingRepoStub();
    stripeCheckoutSessionRepo = createStripeCheckoutSessionRepoStub();
    featuresStub = createFeaturesServiceStub();
    billingStub = createBillingServiceStub();
    stripeMock = createStripeMock();
    webhookHandlerStub = createWebhookHandlerStub();

    service = new DevToolsService(
      orgSubRepo as unknown as IOrgSubscriptionRepository,
      stripeBindingRepo as unknown as IStripeBillingBindingRepository,
      stripeCheckoutSessionRepo as unknown as IStripeCheckoutSessionRepository,
      stripeMock as unknown as Stripe,
      featuresStub as unknown as FeaturesService,
      billingStub as unknown as BillingService,
      webhookHandlerStub as unknown as WebhookHandlerService,
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
      expect(call.stripeSubscriptionStatus).toBe('inactive');
      expect(call.currentPeriodEnds).toBeNull();
      expect(call.lastInvoicePaidAt).toBeNull();
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
    it('delegates to billingService.createCheckoutSession with monthly interval', async () => {
      const result = await service.createCheckout(TENANT_ID, 'pro');

      expect(billingStub.createCheckoutSession).toHaveBeenCalledWith(
        TENANT_ID,
        'pro',
        'monthly',
      );
      expect(result).toEqual({
        url: 'https://checkout.stripe.com/session_123',
      });
    });

    it('passes interval through to billingService', async () => {
      const result = await service.createCheckout(TENANT_ID, 'pro', 'annual');
      expect(billingStub.createCheckoutSession).toHaveBeenCalledWith(
        TENANT_ID,
        'pro',
        'annual',
      );
      expect(result).toEqual({
        url: 'https://checkout.stripe.com/session_123',
      });
    });

    it('accepts enterprise tier', async () => {
      await service.createCheckout(TENANT_ID, 'enterprise', 'monthly');
      expect(billingStub.createCheckoutSession).toHaveBeenCalledWith(
        TENANT_ID,
        'enterprise',
        'monthly',
      );
    });
  });

  describe('cancelSubscription', () => {
    it('throws InternalServerErrorException when Stripe is null', async () => {
      const nullStripeService = new DevToolsService(
        orgSubRepo as unknown as IOrgSubscriptionRepository,
        stripeBindingRepo as unknown as IStripeBillingBindingRepository,
        stripeCheckoutSessionRepo as unknown as IStripeCheckoutSessionRepository,
        null,
        featuresStub as unknown as FeaturesService,
        billingStub as unknown as BillingService,
        webhookHandlerStub as unknown as WebhookHandlerService,
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
        stripeSubscriptionStatus: 'inactive',
        trialEndsAt: new Date(0),
        currentPeriodEnds: null,
        lastInvoicePaidAt: null,
        seatLimit: null,
      });
      expect(stripeBindingRepo.deleteByTenantId).toHaveBeenCalledWith(TENANT_ID);
      expect(stripeCheckoutSessionRepo.deleteByTenantId).toHaveBeenCalledWith(
        TENANT_ID,
      );
      expect(featuresStub.getTenantFeatures).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(mockFeatures);
    });
  });

  describe('setSubscriptionState', () => {
    it('calls upsert with all provided fields and returns features', async () => {
      const state = {
        tier: 'pro' as const,
        stripeCustomerId: 'cus_test',
        stripeSubscriptionId: 'sub_test',
        currentPeriodEnds: new Date('2026-03-01T00:00:00Z'),
        trialEndsAt: null,
        seatLimit: 5,
      };
      const result = await service.setSubscriptionState(TENANT_ID, state);
      expect(orgSubRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          ...state,
          stripeSubscriptionStatus: 'active',
          lastInvoicePaidAt: expect.any(Date),
        }),
      );
      expect(stripeBindingRepo.upsert).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        stripeCustomerId: 'cus_test',
        stripeSubscriptionId: 'sub_test',
      });
      expect(featuresStub.getTenantFeatures).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(mockFeatures);
    });

    it('derives Stripe-backed defaults for paid tiers when optional fields are omitted', async () => {
      const result = await service.setSubscriptionState(TENANT_ID, {
        tier: 'enterprise',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnds: null,
        trialEndsAt: null,
        seatLimit: null,
      });

      expect(orgSubRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          tier: 'enterprise',
          stripeCustomerId: expect.stringMatching(/^cus_devtools_enterprise_/),
          stripeSubscriptionId: expect.stringMatching(
            /^sub_devtools_enterprise_/,
          ),
          stripeSubscriptionStatus: 'active',
          currentPeriodEnds: expect.any(Date),
          trialEndsAt: null,
          lastInvoicePaidAt: expect.any(Date),
          seatLimit: null,
        }),
      );
      expect(featuresStub.getTenantFeatures).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(mockFeatures);
    });
  });

  describe('simulateWebhook', () => {
    it('constructs event and calls webhookHandler.process', async () => {
      const result = await service.simulateWebhook(
        'checkout.session.completed',
        { customer: 'cus_abc' },
        'evt_custom_123',
      );
      expect(webhookHandlerStub.process).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'evt_custom_123',
          type: 'checkout.session.completed',
          data: { object: { customer: 'cus_abc' } },
        }),
      );
      expect(result).toEqual({ processed: true, eventId: 'evt_custom_123' });
    });

    it('generates unique event ID when not provided', async () => {
      const result = await service.simulateWebhook('invoice.paid', {
        amount: 100,
      });
      expect(result.eventId).toMatch(/^evt_sim_/);
      expect(webhookHandlerStub.process).toHaveBeenCalled();
    });
  });
});
