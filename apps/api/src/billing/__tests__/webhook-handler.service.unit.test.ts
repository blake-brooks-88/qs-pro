import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WebhookHandlerService } from '../webhook-handler.service';

function createSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    metadata: { eid: 'encrypted-eid' },
    items: {
      data: [
        {
          price: { product: 'prod_123' },
          quantity: 2,
          current_period_end: Math.floor(Date.now() / 1000) + 3600,
        },
      ],
    },
    ...overrides,
  };
}

describe('WebhookHandlerService', () => {
  let stripeMock: {
    subscriptions: { retrieve: ReturnType<typeof vi.fn> };
    products: { retrieve: ReturnType<typeof vi.fn> };
    charges: { retrieve: ReturnType<typeof vi.fn> };
  };
  let orgSubscriptionRepo: {
    findByTenantId: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    updateFromWebhook: ReturnType<typeof vi.fn>;
  };
  let stripeBindingRepo: {
    findByStripeCustomerId: ReturnType<typeof vi.fn>;
    findByStripeSubscriptionId: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    clearSubscription: ReturnType<typeof vi.fn>;
  };
  let stripeCheckoutSessionRepo: {
    markCompleted: ReturnType<typeof vi.fn>;
    markExpired: ReturnType<typeof vi.fn>;
  };
  let webhookEventRepo: {
    markProcessing: ReturnType<typeof vi.fn>;
    markCompleted: ReturnType<typeof vi.fn>;
    markFailed: ReturnType<typeof vi.fn>;
  };
  let tenantRepo: {
    findByEid: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let rlsContext: {
    runWithTenantContext: ReturnType<typeof vi.fn>;
    runWithIsolatedTenantContext: ReturnType<typeof vi.fn>;
  };
  let auditService: { log: ReturnType<typeof vi.fn> };
  let encryptionService: { decrypt: ReturnType<typeof vi.fn> };
  let service: WebhookHandlerService;

  beforeEach(() => {
    stripeMock = {
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue(createSubscription()),
      },
      products: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'prod_123',
          metadata: { tier: 'pro' },
        }),
      },
      charges: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'ch_123',
          customer: 'cus_123',
        }),
      },
    };
    orgSubscriptionRepo = {
      findByTenantId: vi.fn().mockResolvedValue(undefined),
      upsert: vi.fn().mockResolvedValue(undefined),
      updateFromWebhook: vi.fn().mockResolvedValue(undefined),
    };
    stripeBindingRepo = {
      findByStripeCustomerId: vi.fn().mockResolvedValue(undefined),
      findByStripeSubscriptionId: vi.fn().mockResolvedValue(undefined),
      upsert: vi.fn().mockResolvedValue(undefined),
      clearSubscription: vi.fn().mockResolvedValue(undefined),
    };
    stripeCheckoutSessionRepo = {
      markCompleted: vi.fn().mockResolvedValue(undefined),
      markExpired: vi.fn().mockResolvedValue(undefined),
    };
    webhookEventRepo = {
      markProcessing: vi.fn().mockResolvedValue(true),
      markCompleted: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    tenantRepo = {
      findByEid: vi.fn().mockResolvedValue({
        id: 'tenant-1',
        eid: 'eid-1',
      }),
      findById: vi.fn().mockResolvedValue({
        id: 'tenant-1',
        eid: 'eid-1',
      }),
    };
    rlsContext = {
      runWithTenantContext: vi.fn().mockImplementation((_tenantId, _mid, fn) => fn()),
      runWithIsolatedTenantContext: vi
        .fn()
        .mockImplementation((_tenantId, _mid, fn) => fn()),
    };
    auditService = {
      log: vi.fn().mockResolvedValue(undefined),
    };
    encryptionService = {
      decrypt: vi.fn().mockReturnValue('eid-1'),
    };

    service = new WebhookHandlerService(
      stripeMock as never,
      orgSubscriptionRepo as never,
      stripeBindingRepo as never,
      stripeCheckoutSessionRepo as never,
      webhookEventRepo as never,
      tenantRepo as never,
      rlsContext as never,
      auditService as never,
      encryptionService as never,
    );
  });

  it('skips duplicate events without reprocessing them', async () => {
    webhookEventRepo.markProcessing.mockResolvedValue(false);

    await service.process({
      id: 'evt_duplicate',
      type: 'checkout.session.completed',
      data: { object: {} },
    } as never);

    expect(webhookEventRepo.markCompleted).not.toHaveBeenCalled();
    expect(webhookEventRepo.markFailed).not.toHaveBeenCalled();
  });

  it('marks unpaid checkout sessions complete without applying entitlements', async () => {
    await service.process({
      id: 'evt_unpaid_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_unpaid',
          payment_status: 'unpaid',
        },
      },
    } as never);

    expect(stripeCheckoutSessionRepo.markCompleted).toHaveBeenCalledWith(
      'cs_unpaid',
    );
    expect(stripeBindingRepo.upsert).not.toHaveBeenCalled();
  });

  it('processes checkout.session.completed into a paid subscription state', async () => {
    await service.process({
      id: 'evt_paid_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_paid',
          payment_status: 'paid',
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: { eid: 'encrypted-eid' },
        },
      },
    } as never);

    expect(stripeBindingRepo.upsert).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
    });
    expect(orgSubscriptionRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        tier: 'pro',
        stripeSubscriptionStatus: 'active',
        trialEndsAt: null,
      }),
    );
    expect(webhookEventRepo.markCompleted).toHaveBeenCalledWith(
      'evt_paid_checkout',
    );
  });

  it('preserves the existing paid tier during past_due subscription updates', async () => {
    orgSubscriptionRepo.findByTenantId.mockResolvedValue({
      tenantId: 'tenant-1',
      tier: 'enterprise',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      stripeSubscriptionStatus: 'active',
      lastInvoicePaidAt: new Date(),
      currentPeriodEnds: new Date(Date.now() + 3600_000),
    });

    await service.process({
      id: 'evt_subscription_updated',
      type: 'customer.subscription.updated',
      data: {
        object: createSubscription({ status: 'past_due' }),
      },
    } as never);

    expect(orgSubscriptionRepo.updateFromWebhook).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        tier: 'enterprise',
        stripeSubscriptionStatus: 'past_due',
      }),
    );
  });

  it('rejects customer ownership conflicts and writes an audit event', async () => {
    stripeBindingRepo.findByStripeCustomerId.mockResolvedValue({
      tenantId: 'other-tenant',
    });

    await service.process({
      id: 'evt_conflict',
      type: 'customer.subscription.updated',
      data: {
        object: createSubscription(),
      },
    } as never);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'subscription.webhook_conflict',
      }),
    );
    expect(orgSubscriptionRepo.updateFromWebhook).not.toHaveBeenCalled();
  });

  it('downgrades deleted subscriptions to free and clears bindings', async () => {
    await service.process({
      id: 'evt_subscription_deleted',
      type: 'customer.subscription.deleted',
      data: {
        object: createSubscription(),
      },
    } as never);

    expect(stripeBindingRepo.clearSubscription).toHaveBeenCalledWith('tenant-1');
    expect(orgSubscriptionRepo.updateFromWebhook).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        tier: 'free',
        stripeSubscriptionStatus: 'canceled',
        trialEndsAt: new Date(0),
      }),
    );
  });

  it('updates subscription state on invoice.payment_failed', async () => {
    await service.process({
      id: 'evt_invoice_failed',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_123',
          parent: {
            subscription_details: {
              subscription: 'sub_123',
            },
          },
        },
      },
    } as never);

    expect(orgSubscriptionRepo.updateFromWebhook).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        tier: 'pro',
        stripeSubscriptionStatus: 'active',
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'subscription.payment_failed',
      }),
    );
  });

  it('marks checkout.session.expired and records an audit event', async () => {
    await service.process({
      id: 'evt_checkout_expired',
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_expired',
          metadata: { eid: 'encrypted-eid' },
        },
      },
    } as never);

    expect(stripeCheckoutSessionRepo.markExpired).toHaveBeenCalledWith(
      'cs_expired',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'checkout.expired',
      }),
    );
  });

  it('records refund and dispute audit events from Stripe customer bindings', async () => {
    stripeBindingRepo.findByStripeCustomerId.mockResolvedValue({
      tenantId: 'tenant-1',
    });

    await service.process({
      id: 'evt_charge_refunded',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_123',
          customer: 'cus_123',
          amount_refunded: 500,
        },
      },
    } as never);

    await service.process({
      id: 'evt_dispute_created',
      type: 'charge.dispute.created',
      data: {
        object: {
          id: 'dp_123',
          charge: 'ch_123',
          reason: 'fraudulent',
          status: 'warning_needs_response',
        },
      },
    } as never);

    await service.process({
      id: 'evt_dispute_closed',
      type: 'charge.dispute.closed',
      data: {
        object: {
          id: 'dp_123',
          charge: 'ch_123',
          reason: 'fraudulent',
          status: 'won',
        },
      },
    } as never);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'subscription.refunded' }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'subscription.dispute_opened' }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'subscription.dispute_closed' }),
    );
  });

  it('marks failed events and rethrows when processing fails', async () => {
    tenantRepo.findByEid.mockResolvedValue(undefined);

    await expect(
      service.process({
        id: 'evt_bad_eid',
        type: 'checkout.session.completed',
        data: {
          object: {
            payment_status: 'paid',
            customer: 'cus_123',
            subscription: 'sub_123',
            metadata: { eid: 'encrypted-eid' },
          },
        },
      } as never),
    ).rejects.toThrow('Tenant not found for pricing token');

    expect(webhookEventRepo.markFailed).toHaveBeenCalledWith(
      'evt_bad_eid',
      'Tenant not found for pricing token',
    );
  });
});
