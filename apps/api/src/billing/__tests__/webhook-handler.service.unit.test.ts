import { Logger } from '@nestjs/common';
import type {
  IOrgSubscriptionRepository,
  IStripeWebhookEventRepository,
  ITenantRepository,
} from '@qpp/database';
import { createRlsContextStub, type RlsContextStub } from '@qpp/test-utils';
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditService } from '../../audit/audit.service';
import { WebhookHandlerService } from '../webhook-handler.service';

const TENANT_ID = 'tenant-abc-123';
const TENANT_EID = 'eid-org-456';

const mockTenant = { id: TENANT_ID, eid: TENANT_EID } as any;

function createOrgSubscriptionRepoStub(): {
  [K in keyof IOrgSubscriptionRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    findByTenantId: vi.fn(),
    findByStripeCustomerId: vi.fn(),
    upsert: vi.fn(),
    insertIfNotExists: vi.fn(),
    updateTierByTenantId: vi.fn(),
    updateFromWebhook: vi.fn().mockResolvedValue(undefined),
  };
}

function createWebhookEventRepoStub(): {
  [K in keyof IStripeWebhookEventRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    markProcessing: vi.fn().mockResolvedValue(true),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
}

function createTenantRepoStub(): {
  [K in keyof ITenantRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    findById: vi.fn(),
    findByEid: vi.fn().mockResolvedValue(mockTenant),
    upsert: vi.fn(),
    countUsersByTenantId: vi.fn(),
    updateTier: vi.fn(),
  };
}

function createAuditServiceStub(): {
  [K in keyof AuditService]: ReturnType<typeof vi.fn>;
} {
  return {
    log: vi.fn().mockResolvedValue(undefined),
    findAll: vi.fn(),
  };
}

function createEncryptionServiceStub() {
  return {
    encrypt: vi.fn((v: string) => `enc_${v}`),
    decrypt: vi.fn((v: string) => {
      if (v.startsWith('enc_')) {
        return v.slice(4);
      }
      throw new Error('Not encrypted');
    }),
  };
}

function createStripeStub() {
  return {
    products: {
      retrieve: vi.fn().mockResolvedValue({
        metadata: { tier: 'pro' },
      }),
    },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        metadata: { eid: TENANT_EID },
      }),
    },
  };
}

function makeEvent(
  type: string,
  data: Record<string, unknown>,
  id = 'evt_test_123',
): Stripe.Event {
  return {
    id,
    type,
    data: { object: data },
  } as unknown as Stripe.Event;
}

function makeCheckoutSessionEvent(
  overrides: Partial<{
    customer: string | null;
    subscription: string | null;
    metadata: Record<string, string>;
  }> = {},
): Stripe.Event {
  return makeEvent('checkout.session.completed', {
    customer: 'customer' in overrides ? overrides.customer : 'cus_abc',
    subscription:
      'subscription' in overrides ? overrides.subscription : 'sub_xyz',
    metadata:
      'metadata' in overrides
        ? overrides.metadata
        : { eid: TENANT_EID, tier: 'pro' },
  });
}

function makeSubscriptionEvent(
  type: string,
  overrides: Partial<{
    metadata: Record<string, string>;
    status: string;
    items: { data: unknown[] };
  }> = {},
): Stripe.Event {
  return makeEvent(type, {
    customer: 'cus_abc',
    metadata: overrides.metadata ?? { eid: TENANT_EID },
    status: overrides.status ?? 'active',
    items: overrides.items ?? {
      data: [
        {
          price: { product: 'prod_123' },
          current_period_end: 1700000000,
          quantity: 10,
        },
      ],
    },
  });
}

function makeInvoiceEvent(
  type: string,
  overrides: Partial<{
    parent: unknown;
    period_end: number;
  }> = {},
): Stripe.Event {
  return makeEvent(type, {
    id: 'in_invoice_123',
    parent:
      'parent' in overrides
        ? overrides.parent
        : { subscription_details: { subscription: 'sub_xyz' } },
    period_end: 'period_end' in overrides ? overrides.period_end : 1700000000,
  });
}

describe('WebhookHandlerService', () => {
  let service: WebhookHandlerService;
  let stripeStub: ReturnType<typeof createStripeStub>;
  let orgSubRepo: ReturnType<typeof createOrgSubscriptionRepoStub>;
  let webhookEventRepo: ReturnType<typeof createWebhookEventRepoStub>;
  let tenantRepo: ReturnType<typeof createTenantRepoStub>;
  let rlsStub: RlsContextStub;
  let auditStub: ReturnType<typeof createAuditServiceStub>;
  let encryptionStub: ReturnType<typeof createEncryptionServiceStub>;
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;
  let loggerDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stripeStub = createStripeStub();
    orgSubRepo = createOrgSubscriptionRepoStub();
    webhookEventRepo = createWebhookEventRepoStub();
    tenantRepo = createTenantRepoStub();
    rlsStub = createRlsContextStub();
    auditStub = createAuditServiceStub();
    encryptionStub = createEncryptionServiceStub();

    service = new WebhookHandlerService(
      stripeStub as any,
      orgSubRepo as unknown as IOrgSubscriptionRepository,
      webhookEventRepo as unknown as IStripeWebhookEventRepository,
      tenantRepo as unknown as ITenantRepository,
      rlsStub as any,
      auditStub as unknown as AuditService,
      encryptionStub as any,
    );

    loggerWarnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    loggerDebugSpy = vi
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
    loggerDebugSpy.mockRestore();
  });

  describe('idempotency', () => {
    it('skips duplicate events when markProcessing returns false', async () => {
      webhookEventRepo.markProcessing.mockResolvedValue(false);
      const event = makeCheckoutSessionEvent();

      await service.process(event);

      expect(orgSubRepo.updateFromWebhook).not.toHaveBeenCalled();
      expect(webhookEventRepo.markCompleted).not.toHaveBeenCalled();
    });
  });

  describe('checkout.session.completed', () => {
    it('resolves tenant via eid and updates org subscription', async () => {
      const event = makeCheckoutSessionEvent();

      await service.process(event);

      expect(tenantRepo.findByEid).toHaveBeenCalledWith(TENANT_EID);
      expect(orgSubRepo.updateFromWebhook).toHaveBeenCalledWith(TENANT_ID, {
        stripeCustomerId: 'cus_abc',
        stripeSubscriptionId: 'sub_xyz',
        tier: 'pro',
      });
    });

    it('wraps DB write in RLS context with tenant ID and system mid', async () => {
      const event = makeCheckoutSessionEvent();

      await service.process(event);

      expect(rlsStub.runWithTenantContext).toHaveBeenCalledWith(
        TENANT_ID,
        'system',
        expect.any(Function),
      );
    });

    it('logs subscription.created audit event with mid=system', async () => {
      const event = makeCheckoutSessionEvent();

      await service.process(event);

      expect(auditStub.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'subscription.created',
          mid: 'system',
          tenantId: TENANT_ID,
          actorType: 'system',
        }),
      );
    });

    it('does NOT set currentPeriodEnds (delegates to subscription events)', async () => {
      const event = makeCheckoutSessionEvent();

      await service.process(event);

      expect(orgSubRepo.updateFromWebhook).toHaveBeenCalledWith(
        TENANT_ID,
        expect.not.objectContaining({ currentPeriodEnds: expect.anything() }),
      );
    });

    it('throws when eid is missing from session metadata', async () => {
      const event = makeCheckoutSessionEvent({ metadata: { tier: 'pro' } });

      await expect(service.process(event)).rejects.toThrow(
        'Checkout session missing metadata.eid',
      );
      expect(webhookEventRepo.markFailed).toHaveBeenCalledWith(
        event.id,
        'Checkout session missing metadata.eid',
      );
    });

    it('throws when tier is missing from session metadata', async () => {
      const event = makeCheckoutSessionEvent({
        metadata: { eid: TENANT_EID },
      });

      await expect(service.process(event)).rejects.toThrow(
        'Checkout session missing valid metadata.tier',
      );
      expect(webhookEventRepo.markFailed).toHaveBeenCalled();
    });

    it('throws when customer is null', async () => {
      const event = makeCheckoutSessionEvent({ customer: null });

      await expect(service.process(event)).rejects.toThrow(
        'Checkout session missing customer or subscription ID',
      );
    });

    it('throws when subscription is null', async () => {
      const event = makeCheckoutSessionEvent({ subscription: null });

      await expect(service.process(event)).rejects.toThrow(
        'Checkout session missing customer or subscription ID',
      );
    });

    it('throws when tenant not found for eid', async () => {
      tenantRepo.findByEid.mockResolvedValue(undefined);
      const event = makeCheckoutSessionEvent();

      await expect(service.process(event)).rejects.toThrow(
        `Tenant not found for eid: ${TENANT_EID}`,
      );
      expect(webhookEventRepo.markFailed).toHaveBeenCalled();
    });

    it('marks event as completed on success', async () => {
      const event = makeCheckoutSessionEvent();

      await service.process(event);

      expect(webhookEventRepo.markCompleted).toHaveBeenCalledWith(event.id);
    });
  });

  describe('customer.subscription.created / updated', () => {
    it('resolves tenant via eid from subscription metadata', async () => {
      const event = makeSubscriptionEvent('customer.subscription.created');

      await service.process(event);

      expect(tenantRepo.findByEid).toHaveBeenCalledWith(TENANT_EID);
      expect(orgSubRepo.findByStripeCustomerId).not.toHaveBeenCalled();
    });

    it('resolves tier from Stripe product metadata', async () => {
      const event = makeSubscriptionEvent('customer.subscription.updated');

      await service.process(event);

      expect(stripeStub.products.retrieve).toHaveBeenCalledWith('prod_123');
    });

    it('updates currentPeriodEnds from subscription item current_period_end', async () => {
      const event = makeSubscriptionEvent('customer.subscription.created');

      await service.process(event);

      expect(orgSubRepo.updateFromWebhook).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          currentPeriodEnds: new Date(1700000000 * 1000),
        }),
      );
    });

    it('updates seatLimit from subscription item quantity', async () => {
      const event = makeSubscriptionEvent('customer.subscription.created');

      await service.process(event);

      expect(orgSubRepo.updateFromWebhook).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ seatLimit: 10 }),
      );
    });

    it('wraps DB write in RLS context with tenant ID and system mid', async () => {
      const event = makeSubscriptionEvent('customer.subscription.created');

      await service.process(event);

      expect(rlsStub.runWithTenantContext).toHaveBeenCalledWith(
        TENANT_ID,
        'system',
        expect.any(Function),
      );
    });

    it('does NOT change tier when subscription status is past_due', async () => {
      const event = makeSubscriptionEvent('customer.subscription.updated', {
        status: 'past_due',
      });

      await service.process(event);

      expect(orgSubRepo.updateFromWebhook).toHaveBeenCalledWith(
        TENANT_ID,
        expect.not.objectContaining({ tier: expect.anything() }),
      );
      expect(orgSubRepo.updateFromWebhook).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ currentPeriodEnds: expect.any(Date) }),
      );
    });

    it('does NOT change tier when subscription status is unpaid', async () => {
      const event = makeSubscriptionEvent('customer.subscription.updated', {
        status: 'unpaid',
      });

      await service.process(event);

      expect(orgSubRepo.updateFromWebhook).toHaveBeenCalledWith(
        TENANT_ID,
        expect.not.objectContaining({ tier: expect.anything() }),
      );
    });

    it('throws when eid is missing from subscription metadata', async () => {
      const event = makeSubscriptionEvent('customer.subscription.created', {
        metadata: {},
      });

      await expect(service.process(event)).rejects.toThrow(
        'Subscription missing metadata.eid',
      );
      expect(webhookEventRepo.markFailed).toHaveBeenCalled();
    });

    it('throws when subscription has no line items', async () => {
      const event = makeSubscriptionEvent('customer.subscription.created', {
        items: { data: [] },
      });

      await expect(service.process(event)).rejects.toThrow(
        'Subscription event missing line items',
      );
    });

    it('returns silently when tenant not found (may have been deleted)', async () => {
      tenantRepo.findByEid.mockResolvedValue(undefined);
      const event = makeSubscriptionEvent('customer.subscription.updated');

      await service.process(event);

      expect(orgSubRepo.updateFromWebhook).not.toHaveBeenCalled();
      expect(webhookEventRepo.markCompleted).toHaveBeenCalled();
    });

    it('logs subscription.updated audit event with mid=system', async () => {
      const event = makeSubscriptionEvent('customer.subscription.created');

      await service.process(event);

      expect(auditStub.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'subscription.updated',
          mid: 'system',
          actorType: 'system',
        }),
      );
    });
  });

  describe('customer.subscription.deleted', () => {
    it('resolves tenant via eid and downgrades to free', async () => {
      const event = makeSubscriptionEvent('customer.subscription.deleted');

      await service.process(event);

      expect(tenantRepo.findByEid).toHaveBeenCalledWith(TENANT_EID);
      expect(orgSubRepo.updateFromWebhook).toHaveBeenCalledWith(TENANT_ID, {
        tier: 'free',
        stripeSubscriptionId: null,
        currentPeriodEnds: null,
      });
    });

    it('wraps DB write in RLS context', async () => {
      const event = makeSubscriptionEvent('customer.subscription.deleted');

      await service.process(event);

      expect(rlsStub.runWithTenantContext).toHaveBeenCalledWith(
        TENANT_ID,
        'system',
        expect.any(Function),
      );
    });

    it('logs subscription.canceled audit event', async () => {
      const event = makeSubscriptionEvent('customer.subscription.deleted');

      await service.process(event);

      expect(auditStub.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'subscription.canceled',
          mid: 'system',
        }),
      );
    });

    it('throws when eid is missing from subscription metadata', async () => {
      const event = makeSubscriptionEvent('customer.subscription.deleted', {
        metadata: {},
      });

      await expect(service.process(event)).rejects.toThrow(
        'Subscription missing metadata.eid',
      );
    });

    it('returns silently when tenant not found', async () => {
      tenantRepo.findByEid.mockResolvedValue(undefined);
      const event = makeSubscriptionEvent('customer.subscription.deleted');

      await service.process(event);

      expect(orgSubRepo.updateFromWebhook).not.toHaveBeenCalled();
      expect(webhookEventRepo.markCompleted).toHaveBeenCalled();
    });
  });

  describe('invoice.paid', () => {
    it('retrieves subscription via Stripe API and resolves tenant via eid', async () => {
      const event = makeInvoiceEvent('invoice.paid');

      await service.process(event);

      expect(stripeStub.subscriptions.retrieve).toHaveBeenCalledWith('sub_xyz');
      expect(tenantRepo.findByEid).toHaveBeenCalledWith(TENANT_EID);
    });

    it('updates currentPeriodEnds from invoice period_end', async () => {
      const event = makeInvoiceEvent('invoice.paid');

      await service.process(event);

      expect(orgSubRepo.updateFromWebhook).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          currentPeriodEnds: new Date(1700000000 * 1000),
        }),
      );
    });

    it('wraps DB write in RLS context', async () => {
      const event = makeInvoiceEvent('invoice.paid');

      await service.process(event);

      expect(rlsStub.runWithTenantContext).toHaveBeenCalledWith(
        TENANT_ID,
        'system',
        expect.any(Function),
      );
    });

    it('skips when invoice has no subscription', async () => {
      const event = makeInvoiceEvent('invoice.paid', { parent: null });

      await service.process(event);

      expect(stripeStub.subscriptions.retrieve).not.toHaveBeenCalled();
      expect(orgSubRepo.updateFromWebhook).not.toHaveBeenCalled();
    });

    it('skips when subscription has no eid metadata', async () => {
      stripeStub.subscriptions.retrieve.mockResolvedValue({
        metadata: {},
      });
      const event = makeInvoiceEvent('invoice.paid');

      await service.process(event);

      expect(orgSubRepo.updateFromWebhook).not.toHaveBeenCalled();
      expect(webhookEventRepo.markCompleted).toHaveBeenCalled();
    });

    it('logs audit event with mid=system', async () => {
      const event = makeInvoiceEvent('invoice.paid');

      await service.process(event);

      expect(auditStub.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'subscription.updated',
          mid: 'system',
        }),
      );
    });
  });

  describe('invoice.payment_failed', () => {
    it('does NOT downgrade tier (graceful degradation)', async () => {
      const event = makeInvoiceEvent('invoice.payment_failed');

      await service.process(event);

      expect(orgSubRepo.updateFromWebhook).not.toHaveBeenCalled();
    });

    it('logs subscription.payment_failed audit event', async () => {
      const event = makeInvoiceEvent('invoice.payment_failed');

      await service.process(event);

      expect(auditStub.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'subscription.payment_failed',
          mid: 'system',
        }),
      );
    });

    it('skips when invoice has no subscription', async () => {
      const event = makeInvoiceEvent('invoice.payment_failed', {
        parent: null,
      });

      await service.process(event);

      expect(stripeStub.subscriptions.retrieve).not.toHaveBeenCalled();
      expect(auditStub.log).not.toHaveBeenCalled();
    });

    it('does not throw when tenant resolution fails', async () => {
      stripeStub.subscriptions.retrieve.mockRejectedValue(
        new Error('Stripe API error'),
      );
      const event = makeInvoiceEvent('invoice.payment_failed');

      await service.process(event);

      expect(webhookEventRepo.markCompleted).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('calls markFailed and re-throws when handler throws', async () => {
      tenantRepo.findByEid.mockRejectedValue(new Error('DB connection lost'));
      const event = makeCheckoutSessionEvent();

      await expect(service.process(event)).rejects.toThrow(
        'DB connection lost',
      );
      expect(webhookEventRepo.markFailed).toHaveBeenCalledWith(
        event.id,
        'DB connection lost',
      );
    });

    it('does not call markCompleted when handler throws', async () => {
      tenantRepo.findByEid.mockRejectedValue(new Error('fail'));
      const event = makeCheckoutSessionEvent();

      await expect(service.process(event)).rejects.toThrow();
      expect(webhookEventRepo.markCompleted).not.toHaveBeenCalled();
    });
  });

  describe('unhandled event type', () => {
    it('marks event as completed without taking action', async () => {
      const event = makeEvent('some.unknown.event', {});

      await service.process(event);

      expect(orgSubRepo.updateFromWebhook).not.toHaveBeenCalled();
      expect(webhookEventRepo.markCompleted).toHaveBeenCalledWith(event.id);
    });
  });

  describe('RLS wrapping', () => {
    it('all org_subscriptions writes go through runWithTenantContext', async () => {
      const events = [
        makeCheckoutSessionEvent(),
        makeSubscriptionEvent('customer.subscription.created'),
        makeSubscriptionEvent('customer.subscription.deleted'),
        makeInvoiceEvent('invoice.paid'),
      ];

      for (const event of events) {
        vi.clearAllMocks();
        webhookEventRepo.markProcessing.mockResolvedValue(true);
        tenantRepo.findByEid.mockResolvedValue(mockTenant);
        orgSubRepo.updateFromWebhook.mockResolvedValue(undefined);
        stripeStub.products.retrieve.mockResolvedValue({
          metadata: { tier: 'pro' },
        });
        stripeStub.subscriptions.retrieve.mockResolvedValue({
          metadata: { eid: TENANT_EID },
        });
        auditStub.log.mockResolvedValue(undefined);
        webhookEventRepo.markCompleted.mockResolvedValue(undefined);

        await service.process(event);

        expect(rlsStub.runWithTenantContext).toHaveBeenCalledWith(
          TENANT_ID,
          'system',
          expect.any(Function),
        );
      }
    });
  });

  describe('audit mid=system', () => {
    it('all audit calls use mid=system', async () => {
      const events = [
        makeCheckoutSessionEvent(),
        makeSubscriptionEvent('customer.subscription.created'),
        makeSubscriptionEvent('customer.subscription.deleted'),
        makeInvoiceEvent('invoice.paid'),
        makeInvoiceEvent('invoice.payment_failed'),
      ];

      for (const event of events) {
        vi.clearAllMocks();
        webhookEventRepo.markProcessing.mockResolvedValue(true);
        tenantRepo.findByEid.mockResolvedValue(mockTenant);
        orgSubRepo.updateFromWebhook.mockResolvedValue(undefined);
        stripeStub.products.retrieve.mockResolvedValue({
          metadata: { tier: 'pro' },
        });
        stripeStub.subscriptions.retrieve.mockResolvedValue({
          metadata: { eid: TENANT_EID },
        });
        auditStub.log.mockResolvedValue(undefined);
        webhookEventRepo.markCompleted.mockResolvedValue(undefined);

        await service.process(event);

        if (auditStub.log.mock.calls.length > 0) {
          expect(auditStub.log).toHaveBeenCalledWith(
            expect.objectContaining({ mid: 'system' }),
          );
        }
      }
    });
  });
});
