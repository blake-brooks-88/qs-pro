import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WebhookHandlerService } from '../webhook-handler.service';

type TenantRecord = { id: string; eid: string };

type BindingRecord = {
  tenantId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

type OrgSubscriptionRecord = {
  tenantId: string;
  tier: 'free' | 'pro' | 'enterprise';
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string;
  currentPeriodEnds: Date | null;
  seatLimit: number | null;
  lastInvoicePaidAt: Date | null;
  trialEndsAt: Date | null;
  stripeStateUpdatedAt: Date | null;
};

function makeSubscription(params: {
  id: string;
  customer: unknown;
  status?: string;
  eidToken?: string | null;
  priceLookupKey?: string;
  quantity?: number;
  currentPeriodEndEpoch?: number;
}): Stripe.Subscription {
  return {
    id: params.id,
    customer: params.customer,
    status: params.status ?? 'active',
    metadata: params.eidToken ? { eid: params.eidToken } : {},
    items: {
      data: [
        {
          price: {
            id: 'price_1',
            lookup_key: params.priceLookupKey ?? 'pro_monthly',
          },
          quantity: params.quantity ?? 1,
          current_period_end: params.currentPeriodEndEpoch ?? 1700000000,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function makeCheckoutSession(params: {
  id: string;
  paymentStatus: string;
  customer?: unknown;
  subscription?: unknown;
  customerId?: string;
  subscriptionId?: string;
  eidToken?: string | null;
  mode?: string;
}): Stripe.Checkout.Session {
  return {
    id: params.id,
    mode: params.mode ?? 'subscription',
    payment_status: params.paymentStatus,
    customer: params.customer ?? params.customerId ?? null,
    subscription: params.subscription ?? params.subscriptionId ?? null,
    metadata: params.eidToken ? { eid: params.eidToken } : {},
  } as unknown as Stripe.Checkout.Session;
}

function makeInvoice(params: {
  id: string;
  subscriptionId?: string | null;
  eidToken?: string | null;
}): Stripe.Invoice {
  return {
    id: params.id,
    subscription: params.subscriptionId ?? null,
    metadata: params.eidToken ? { eid: params.eidToken } : {},
    lines: { data: [] },
  } as unknown as Stripe.Invoice;
}

function makeCharge(params: {
  id: string;
  customerId?: string | null;
  amountRefunded?: number;
}): Stripe.Charge {
  return {
    id: params.id,
    customer: params.customerId ?? null,
    amount_refunded: params.amountRefunded ?? 0,
  } as unknown as Stripe.Charge;
}

function createHarness(options?: { stripeConfigured?: boolean }) {
  const stripeConfigured = options?.stripeConfigured ?? true;

  const tenantsById = new Map<string, TenantRecord>();
  const tenantsByEid = new Map<string, TenantRecord>();

  const bindingsByTenantId = new Map<string, BindingRecord>();
  const bindingByCustomerId = new Map<string, BindingRecord>();
  const bindingBySubscriptionId = new Map<string, BindingRecord>();

  const subscriptionsByTenantId = new Map<string, OrgSubscriptionRecord>();

  const checkoutSessionCompleted = new Set<string>();
  const checkoutSessionExpired = new Set<string>();

  const webhookEvents = new Map<
    string,
    {
      status: 'processing' | 'completed' | 'failed';
      type: string;
      error?: string;
    }
  >();

  const auditEvents: unknown[] = [];

  const stripeSubscriptions = new Map<string, Stripe.Subscription>();
  const stripeCharges = new Map<string, Stripe.Charge>();

  const tenantRepo = {
    findByEid: vi.fn(async (eid: string) => tenantsByEid.get(eid) ?? null),
    findById: vi.fn(async (id: string) => tenantsById.get(id) ?? null),
  };

  const stripeBindingRepo = {
    findByStripeCustomerId: vi.fn(
      async (id: string) => bindingByCustomerId.get(id) ?? null,
    ),
    findByStripeSubscriptionId: vi.fn(
      async (id: string) => bindingBySubscriptionId.get(id) ?? null,
    ),
    upsert: vi.fn(async (record: BindingRecord) => {
      const existing = bindingsByTenantId.get(record.tenantId) ?? null;

      if (existing?.stripeCustomerId) {
        bindingByCustomerId.delete(existing.stripeCustomerId);
      }
      if (existing?.stripeSubscriptionId) {
        bindingBySubscriptionId.delete(existing.stripeSubscriptionId);
      }

      bindingsByTenantId.set(record.tenantId, record);
      if (record.stripeCustomerId) {
        bindingByCustomerId.set(record.stripeCustomerId, record);
      }
      if (record.stripeSubscriptionId) {
        bindingBySubscriptionId.set(record.stripeSubscriptionId, record);
      }
    }),
    clearSubscription: vi.fn(async (tenantId: string) => {
      const existing = bindingsByTenantId.get(tenantId);
      if (!existing) {
        return;
      }
      if (existing.stripeSubscriptionId) {
        bindingBySubscriptionId.delete(existing.stripeSubscriptionId);
      }
      const next: BindingRecord = {
        ...existing,
        stripeSubscriptionId: null,
      };
      bindingsByTenantId.set(tenantId, next);
      if (next.stripeCustomerId) {
        bindingByCustomerId.set(next.stripeCustomerId, next);
      }
    }),
  };

  const orgSubscriptionRepo = {
    findByTenantId: vi.fn(
      async (tenantId: string) => subscriptionsByTenantId.get(tenantId) ?? null,
    ),
    upsert: vi.fn(async (record: OrgSubscriptionRecord) => {
      subscriptionsByTenantId.set(record.tenantId, record);
    }),
  };

  const stripeCheckoutSessionRepo = {
    markCompleted: vi.fn(async (id: string) => {
      checkoutSessionCompleted.add(id);
    }),
    markExpired: vi.fn(async (id: string) => {
      checkoutSessionExpired.add(id);
    }),
  };

  const webhookEventRepo = {
    markProcessing: vi.fn(async (id: string, type: string) => {
      const existing = webhookEvents.get(id);
      if (
        existing &&
        (existing.status === 'processing' || existing.status === 'completed')
      ) {
        return false;
      }
      webhookEvents.set(id, { status: 'processing', type });
      return true;
    }),
    markCompleted: vi.fn(async (id: string) => {
      const existing = webhookEvents.get(id);
      if (!existing) {
        webhookEvents.set(id, { status: 'completed', type: 'unknown' });
        return;
      }
      webhookEvents.set(id, { ...existing, status: 'completed' });
    }),
    markFailed: vi.fn(async (id: string, errorMessage: string) => {
      const existing = webhookEvents.get(id);
      const type = existing?.type ?? 'unknown';
      webhookEvents.set(id, { status: 'failed', type, error: errorMessage });
    }),
  };

  const rlsContext = {
    runWithTenantContext: vi.fn(
      async (_tenantId: string, _mid: string, fn: () => unknown) => fn(),
    ),
    runWithIsolatedTenantContext: vi.fn(
      async (_tenantId: string, _mid: string, fn: () => unknown) => fn(),
    ),
  };

  const auditService = {
    log: vi.fn(async (event: unknown) => {
      auditEvents.push(event);
    }),
  };

  const encryptionService = {
    decrypt: vi.fn((token: string) => {
      if (token.startsWith('enc:')) {
        return token.slice('enc:'.length);
      }
      throw new Error('bad token');
    }),
  };

  const stripeCatalog = {
    resolveTierFromPrice: vi.fn(async (price: unknown) => {
      const lookup = (price as { lookup_key?: string }).lookup_key ?? '';
      return lookup.includes('enterprise') ? 'enterprise' : 'pro';
    }),
  };

  const stripe = stripeConfigured
    ? ({
        subscriptions: {
          retrieve: vi.fn(async (id: string) => {
            const sub = stripeSubscriptions.get(id);
            if (!sub) {
              throw new Error(`subscription not found: ${id}`);
            }
            return sub;
          }),
        },
        charges: {
          retrieve: vi.fn(async (id: string) => {
            const charge = stripeCharges.get(id);
            if (!charge) {
              throw new Error(`charge not found: ${id}`);
            }
            return charge;
          }),
        },
      } as unknown as Stripe)
    : null;

  const service = new WebhookHandlerService(
    stripe,
    orgSubscriptionRepo as never,
    stripeBindingRepo as never,
    stripeCheckoutSessionRepo as never,
    webhookEventRepo as never,
    tenantRepo as never,
    rlsContext as never,
    auditService as never,
    encryptionService as never,
    stripeCatalog as never,
  );

  function addTenant(tenant: TenantRecord) {
    tenantsById.set(tenant.id, tenant);
    tenantsByEid.set(tenant.eid, tenant);
  }

  function seedOrgSubscription(
    record: Partial<OrgSubscriptionRecord> & { tenantId: string },
  ) {
    const existing = subscriptionsByTenantId.get(record.tenantId);
    subscriptionsByTenantId.set(record.tenantId, {
      tenantId: record.tenantId,
      tier: record.tier ?? existing?.tier ?? 'free',
      stripeCustomerId:
        record.stripeCustomerId ?? existing?.stripeCustomerId ?? null,
      stripeSubscriptionId:
        record.stripeSubscriptionId ?? existing?.stripeSubscriptionId ?? null,
      stripeSubscriptionStatus:
        record.stripeSubscriptionStatus ??
        existing?.stripeSubscriptionStatus ??
        'inactive',
      currentPeriodEnds:
        record.currentPeriodEnds ?? existing?.currentPeriodEnds ?? null,
      seatLimit: record.seatLimit ?? existing?.seatLimit ?? null,
      lastInvoicePaidAt:
        record.lastInvoicePaidAt ?? existing?.lastInvoicePaidAt ?? null,
      trialEndsAt: record.trialEndsAt ?? existing?.trialEndsAt ?? null,
      stripeStateUpdatedAt:
        record.stripeStateUpdatedAt ?? existing?.stripeStateUpdatedAt ?? null,
    });
  }

  function seedBinding(record: BindingRecord) {
    bindingsByTenantId.set(record.tenantId, record);
    if (record.stripeCustomerId) {
      bindingByCustomerId.set(record.stripeCustomerId, record);
    }
    if (record.stripeSubscriptionId) {
      bindingBySubscriptionId.set(record.stripeSubscriptionId, record);
    }
  }

  return {
    service,
    auditService,
    encryptionService,
    stripeCatalog,
    stripe,
    auditEvents,
    addTenant,
    seedBinding,
    seedOrgSubscription,
    stripeSubscriptions,
    stripeCharges,
    subscriptionsByTenantId,
    bindingsByTenantId,
    checkoutSessionCompleted,
    checkoutSessionExpired,
    webhookEvents,
  };
}

describe('WebhookHandlerService (behavioral unit)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('completes unknown webhook events without doing anything', async () => {
    const h = createHarness();

    const event: Stripe.Event = {
      id: 'evt_unknown',
      type: 'payment_method.attached',
      data: { object: {} },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.webhookEvents.get('evt_unknown')?.status).toBe('completed');
  });

  it('skips processing when event is already in progress or completed', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    const event: Stripe.Event = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: makeCheckoutSession({ id: 'cs_1', paymentStatus: 'unpaid' }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);
    await h.service.process(event);

    expect(h.webhookEvents.get('evt_1')?.status).toBe('completed');
    expect(h.checkoutSessionCompleted.has('cs_1')).toBe(true);
  });

  it('skips checkout.session.completed when mode is not subscription', async () => {
    const h = createHarness();

    const event: Stripe.Event = {
      id: 'evt_checkout_payment',
      type: 'checkout.session.completed',
      data: {
        object: makeCheckoutSession({
          id: 'cs_payment',
          paymentStatus: 'paid',
          mode: 'payment',
          customerId: 'cus_1',
          subscriptionId: 'sub_1',
        }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.checkoutSessionCompleted.has('cs_payment')).toBe(false);
    expect(h.webhookEvents.get('evt_checkout_payment')?.status).toBe(
      'completed',
    );
  });

  it('marks the webhook event failed when a paid checkout session is missing Stripe IDs', async () => {
    const h = createHarness();

    const event: Stripe.Event = {
      id: 'evt_checkout_missing_ids',
      type: 'checkout.session.completed',
      data: {
        object: makeCheckoutSession({
          id: 'cs_missing',
          paymentStatus: 'paid',
        }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).rejects.toThrow(
      'Checkout session missing customer or subscription ID',
    );
    expect(h.webhookEvents.get('evt_checkout_missing_ids')?.status).toBe(
      'failed',
    );
  });

  it('marks the webhook event failed when Stripe is not configured for a paid checkout', async () => {
    const h = createHarness({ stripeConfigured: false });

    const event: Stripe.Event = {
      id: 'evt_checkout_no_stripe',
      type: 'checkout.session.completed',
      data: {
        object: makeCheckoutSession({
          id: 'cs_paid',
          paymentStatus: 'paid',
          customerId: 'cus_1',
          subscriptionId: 'sub_1',
        }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).rejects.toThrow(
      'Stripe client not configured',
    );
    expect(h.webhookEvents.get('evt_checkout_no_stripe')?.status).toBe(
      'failed',
    );
  });

  it('marks checkout sessions completed for unpaid sessions and does not create subscriptions', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    const event: Stripe.Event = {
      id: 'evt_unpaid',
      type: 'checkout.session.completed',
      data: {
        object: makeCheckoutSession({
          id: 'cs_unpaid',
          paymentStatus: 'unpaid',
          customerId: 'cus_1',
          subscriptionId: 'sub_1',
          eidToken: 'enc:eid-1',
        }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);

    expect(h.checkoutSessionCompleted.has('cs_unpaid')).toBe(true);
    expect(h.subscriptionsByTenantId.get('t-1')).toBeUndefined();
  });

  it('does not persist state for a paid checkout when tenant cannot be resolved', async () => {
    const h = createHarness();

    h.stripeSubscriptions.set(
      'sub_1',
      makeSubscription({
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        priceLookupKey: 'pro_monthly',
      }),
    );

    const event: Stripe.Event = {
      id: 'evt_paid_no_tenant',
      type: 'checkout.session.completed',
      data: {
        object: makeCheckoutSession({
          id: 'cs_paid_no_tenant',
          paymentStatus: 'paid',
          customerId: 'cus_1',
          subscriptionId: 'sub_1',
        }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.bindingsByTenantId.size).toBe(0);
    expect(h.subscriptionsByTenantId.size).toBe(0);
    expect(h.checkoutSessionCompleted.has('cs_paid_no_tenant')).toBe(false);
  });

  it('processes a paid checkout and persists binding + subscription state', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    h.stripeSubscriptions.set(
      'sub_1',
      makeSubscription({
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        eidToken: 'enc:eid-1',
        priceLookupKey: 'pro_monthly',
        quantity: 2,
        currentPeriodEndEpoch: 1700001000,
      }),
    );

    const event: Stripe.Event = {
      id: 'evt_paid_checkout',
      type: 'checkout.session.completed',
      created: 1700000000,
      data: {
        object: makeCheckoutSession({
          id: 'cs_paid',
          paymentStatus: 'paid',
          customerId: 'cus_1',
          subscriptionId: 'sub_1',
          eidToken: 'enc:eid-1',
        }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);

    expect(h.bindingsByTenantId.get('t-1')).toEqual({
      tenantId: 't-1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    });

    const sub = h.subscriptionsByTenantId.get('t-1');
    if (!sub) {
      throw new Error('expected subscription');
    }
    expect(sub.tier).toBe('pro');
    expect(sub.seatLimit).toBe(2);
    expect(sub.stripeSubscriptionStatus).toBe('active');
    expect(sub.currentPeriodEnds?.toISOString()).toBe(
      new Date(1700001000 * 1000).toISOString(),
    );
    expect(h.checkoutSessionCompleted.has('cs_paid')).toBe(true);
  });

  it('covers binding conflict auditing even when the audit log write fails', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });
    h.addTenant({ id: 't-2', eid: 'eid-2' });

    h.seedBinding({
      tenantId: 't-2',
      stripeCustomerId: 'cus_conflict',
      stripeSubscriptionId: 'sub_conflict',
    });

    h.stripeSubscriptions.set(
      'sub_1',
      makeSubscription({
        id: 'sub_1',
        customer: { id: 'cus_conflict' },
        status: 'active',
        priceLookupKey: 'pro_monthly',
      }),
    );

    h.auditService.log.mockImplementationOnce(async () => {
      throw new Error('audit write failed');
    });

    const event: Stripe.Event = {
      id: 'evt_conflict_audit_fails',
      type: 'checkout.session.completed',
      data: {
        object: makeCheckoutSession({
          id: 'cs_conflict',
          paymentStatus: 'paid',
          customer: { id: 'cus_conflict' },
          subscription: { id: 'sub_1' },
          eidToken: 'enc:eid-1',
        }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.subscriptionsByTenantId.get('t-1')).toBeUndefined();
    expect(h.checkoutSessionCompleted.has('cs_conflict')).toBe(false);
    expect(h.webhookEvents.get('evt_conflict_audit_fails')?.status).toBe(
      'completed',
    );
  });

  it('preserves paid tier when subscription is past_due or unpaid', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    h.seedOrgSubscription({
      tenantId: 't-1',
      tier: 'enterprise',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      stripeSubscriptionStatus: 'active',
    });

    const event: Stripe.Event = {
      id: 'evt_past_due',
      type: 'customer.subscription.updated',
      data: {
        object: makeSubscription({
          id: 'sub_1',
          customer: 'cus_1',
          status: 'past_due',
          eidToken: 'enc:eid-1',
          priceLookupKey: 'pro_monthly',
          quantity: 1,
        }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);

    expect(h.subscriptionsByTenantId.get('t-1')?.tier).toBe('enterprise');
  });

  it('normalizes unknown Stripe subscription statuses to inactive', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    const event: Stripe.Event = {
      id: 'evt_unknown_status',
      type: 'customer.subscription.updated',
      data: {
        object: makeSubscription({
          id: 'sub_1',
          customer: 'cus_1',
          status: 'mystery_status',
          eidToken: 'enc:eid-1',
          priceLookupKey: 'pro_monthly',
        }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);
    expect(h.subscriptionsByTenantId.get('t-1')?.stripeSubscriptionStatus).toBe(
      'inactive',
    );
  });

  it('resolves tenants from bindings when metadata.eid is valid but the tenant does not exist', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    h.seedBinding({
      tenantId: 't-1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    });

    const event: Stripe.Event = {
      id: 'evt_token_tenant_missing',
      type: 'customer.subscription.updated',
      data: {
        object: makeSubscription({
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          eidToken: 'enc:eid-does-not-exist',
        }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.subscriptionsByTenantId.get('t-1')?.stripeCustomerId).toBe(
      'cus_1',
    );
  });

  it('resolves tenants from bindings when metadata.eid is invalid but bindings exist', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    h.seedBinding({
      tenantId: 't-1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    });

    const event: Stripe.Event = {
      id: 'evt_bad_token_with_binding',
      type: 'customer.subscription.updated',
      data: {
        object: makeSubscription({
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          eidToken: 'not-encrypted',
        }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.subscriptionsByTenantId.get('t-1')?.stripeSubscriptionId).toBe(
      'sub_1',
    );
  });

  it('allows tenant rebind on subscription.created even if subscription record has different Stripe IDs', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    h.seedOrgSubscription({
      tenantId: 't-1',
      tier: 'pro',
      stripeCustomerId: 'cus_old',
      stripeSubscriptionId: 'sub_old',
      stripeSubscriptionStatus: 'active',
    });

    const event: Stripe.Event = {
      id: 'evt_rebind',
      type: 'customer.subscription.created',
      data: {
        object: makeSubscription({
          id: 'sub_new',
          customer: 'cus_new',
          status: 'active',
          eidToken: 'enc:eid-1',
          priceLookupKey: 'enterprise_monthly',
          quantity: 3,
        }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);

    const sub = h.subscriptionsByTenantId.get('t-1');
    if (!sub) {
      throw new Error('expected subscription');
    }
    expect(sub.tier).toBe('enterprise');
    expect(sub.stripeCustomerId).toBe('cus_new');
    expect(sub.stripeSubscriptionId).toBe('sub_new');
  });

  it('blocks updates when the Stripe customer is already bound to another tenant', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });
    h.addTenant({ id: 't-2', eid: 'eid-2' });
    h.seedBinding({
      tenantId: 't-2',
      stripeCustomerId: 'cus_conflict',
      stripeSubscriptionId: 'sub_conflict',
    });

    const event: Stripe.Event = {
      id: 'evt_conflict',
      type: 'customer.subscription.updated',
      data: {
        object: makeSubscription({
          id: 'sub_1',
          customer: 'cus_conflict',
          status: 'active',
          eidToken: 'enc:eid-1',
        }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);
    expect(h.subscriptionsByTenantId.get('t-1')).toBeUndefined();
  });

  it('blocks updates when the Stripe subscription is already bound to another tenant', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });
    h.addTenant({ id: 't-2', eid: 'eid-2' });
    h.seedBinding({
      tenantId: 't-2',
      stripeCustomerId: 'cus_2',
      stripeSubscriptionId: 'sub_conflict',
    });

    const event: Stripe.Event = {
      id: 'evt_sub_conflict',
      type: 'customer.subscription.updated',
      data: {
        object: makeSubscription({
          id: 'sub_conflict',
          customer: 'cus_1',
          status: 'active',
          eidToken: 'enc:eid-1',
        }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.subscriptionsByTenantId.get('t-1')).toBeUndefined();
  });

  it('blocks updates when the incoming Stripe customer does not match the tenant subscription record', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    h.seedOrgSubscription({
      tenantId: 't-1',
      tier: 'pro',
      stripeCustomerId: 'cus_old',
      stripeSubscriptionId: 'sub_1',
      stripeSubscriptionStatus: 'active',
    });

    const event: Stripe.Event = {
      id: 'evt_customer_mismatch',
      type: 'customer.subscription.updated',
      data: {
        object: makeSubscription({
          id: 'sub_1',
          customer: 'cus_new',
          status: 'active',
          eidToken: 'enc:eid-1',
        }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.subscriptionsByTenantId.get('t-1')?.stripeCustomerId).toBe(
      'cus_old',
    );
  });

  it('blocks updates when the incoming Stripe subscription does not match the tenant subscription record', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    h.seedOrgSubscription({
      tenantId: 't-1',
      tier: 'pro',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_old',
      stripeSubscriptionStatus: 'active',
    });

    const event: Stripe.Event = {
      id: 'evt_subscription_mismatch',
      type: 'customer.subscription.updated',
      data: {
        object: makeSubscription({
          id: 'sub_new',
          customer: 'cus_1',
          status: 'active',
          eidToken: 'enc:eid-1',
        }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.subscriptionsByTenantId.get('t-1')?.stripeSubscriptionId).toBe(
      'sub_old',
    );
  });

  it('marks the webhook event failed when subscription line items are missing', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    const event: Stripe.Event = {
      id: 'evt_missing_items',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          metadata: { eid: 'enc:eid-1' },
          items: { data: [] },
        },
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).rejects.toThrow(
      'Subscription event missing line items',
    );
    expect(h.webhookEvents.get('evt_missing_items')?.status).toBe('failed');
  });

  it('sets currentPeriodEnds to null when missing on subscription updates', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    const event: Stripe.Event = {
      id: 'evt_missing_period_end',
      type: 'customer.subscription.updated',
      data: {
        object: makeSubscription({
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          eidToken: 'enc:eid-1',
          priceLookupKey: 'pro_monthly',
          currentPeriodEndEpoch: 0,
        }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);

    expect(h.subscriptionsByTenantId.get('t-1')?.currentPeriodEnds).toBeNull();
    expect(h.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'subscription.updated',
        metadata: expect.objectContaining({ currentPeriodEnds: null }),
      }),
    );
  });

  it('downgrades to free on subscription.deleted and clears subscription binding', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });
    h.seedBinding({
      tenantId: 't-1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    });
    h.seedOrgSubscription({
      tenantId: 't-1',
      tier: 'pro',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      stripeSubscriptionStatus: 'active',
    });

    const event: Stripe.Event = {
      id: 'evt_deleted',
      type: 'customer.subscription.deleted',
      data: {
        object: makeSubscription({
          id: 'sub_1',
          customer: 'cus_1',
          status: 'canceled',
          eidToken: 'enc:eid-1',
        }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);

    const sub = h.subscriptionsByTenantId.get('t-1');
    if (!sub) {
      throw new Error('expected subscription');
    }
    expect(sub.tier).toBe('free');
    expect(sub.stripeCustomerId).toBeNull();
    expect(sub.stripeSubscriptionId).toBeNull();
    expect(sub.trialEndsAt?.toISOString()).toBe(new Date(0).toISOString());

    const binding = h.bindingsByTenantId.get('t-1');
    if (!binding) {
      throw new Error('expected binding');
    }
    expect(binding.stripeSubscriptionId).toBeNull();
  });

  it('handles invoice.paid by updating lastInvoicePaidAt', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    h.stripeSubscriptions.set(
      'sub_1',
      makeSubscription({
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        eidToken: 'enc:eid-1',
        priceLookupKey: 'pro_monthly',
        quantity: 5,
      }),
    );

    const event: Stripe.Event = {
      id: 'evt_invoice_paid',
      type: 'invoice.paid',
      data: {
        object: makeInvoice({ id: 'in_1', subscriptionId: 'sub_1' }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);

    const sub = h.subscriptionsByTenantId.get('t-1');
    if (!sub) {
      throw new Error('expected subscription');
    }
    expect(sub.lastInvoicePaidAt).toBeInstanceOf(Date);
    expect(sub.seatLimit).toBe(5);
  });

  it('handles invoice.payment_succeeded by calling the invoice.paid handler', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    h.stripeSubscriptions.set(
      'sub_1',
      makeSubscription({
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        eidToken: 'enc:eid-1',
        priceLookupKey: 'pro_monthly',
        quantity: 2,
      }),
    );

    const event: Stripe.Event = {
      id: 'evt_invoice_succeeded',
      type: 'invoice.payment_succeeded',
      data: {
        object: makeInvoice({ id: 'in_2', subscriptionId: 'sub_1' }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);
    expect(
      h.subscriptionsByTenantId.get('t-1')?.lastInvoicePaidAt,
    ).toBeInstanceOf(Date);
  });

  it('extracts invoice subscription IDs from subscription_details', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    h.stripeSubscriptions.set(
      'sub_1',
      makeSubscription({
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        eidToken: 'enc:eid-1',
        priceLookupKey: 'pro_monthly',
        quantity: 4,
      }),
    );

    const event: Stripe.Event = {
      id: 'evt_invoice_sub_details',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_sub_details',
          subscription: null,
          subscription_details: { subscription: 'sub_1' },
          lines: { data: [] },
        },
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);
    expect(h.subscriptionsByTenantId.get('t-1')?.seatLimit).toBe(4);
  });

  it('extracts invoice subscription IDs from parent subscription_details', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    h.stripeSubscriptions.set(
      'sub_1',
      makeSubscription({
        id: 'sub_1',
        customer: { id: 'cus_1' },
        status: 'active',
        eidToken: 'enc:eid-1',
        priceLookupKey: 'pro_monthly',
        quantity: 6,
      }),
    );

    const event: Stripe.Event = {
      id: 'evt_invoice_parent',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_parent',
          subscription: null,
          parent: {
            subscription_details: { subscription: { id: 'sub_1' } },
          },
          lines: { data: [] },
        },
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);
    expect(h.subscriptionsByTenantId.get('t-1')?.seatLimit).toBe(6);
  });

  it('extracts invoice subscription IDs from invoice line items', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    h.stripeSubscriptions.set(
      'sub_1',
      makeSubscription({
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        eidToken: 'enc:eid-1',
        priceLookupKey: 'pro_monthly',
        quantity: 7,
      }),
    );

    const event: Stripe.Event = {
      id: 'evt_invoice_lines',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_lines',
          subscription: null,
          lines: { data: [{ subscription: { id: 'sub_1' } }] },
        },
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);
    expect(h.subscriptionsByTenantId.get('t-1')?.seatLimit).toBe(7);
  });

  it('skips invoice.paid updates when the subscription ID cannot be determined', async () => {
    const h = createHarness();

    const event: Stripe.Event = {
      id: 'evt_invoice_no_sub',
      type: 'invoice.paid',
      data: { object: makeInvoice({ id: 'in_no_sub', subscriptionId: null }) },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.webhookEvents.get('evt_invoice_no_sub')?.status).toBe('completed');
  });

  it('marks the webhook event failed for invoice.paid when Stripe is not configured', async () => {
    const h = createHarness({ stripeConfigured: false });

    const event: Stripe.Event = {
      id: 'evt_invoice_paid_no_stripe',
      type: 'invoice.paid',
      data: { object: makeInvoice({ id: 'in_1', subscriptionId: 'sub_1' }) },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).rejects.toThrow(
      'Stripe client not configured',
    );
    expect(h.webhookEvents.get('evt_invoice_paid_no_stripe')?.status).toBe(
      'failed',
    );
  });

  it('records failed webhook events when tenant cannot be resolved from a bad token', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    const event: Stripe.Event = {
      id: 'evt_bad_token',
      type: 'customer.subscription.updated',
      data: {
        object: makeSubscription({
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          eidToken: 'not-encrypted',
        }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).rejects.toThrow(
      'customer.subscription.updated: failed to resolve tenant from metadata.eid token and no bindings found',
    );

    expect(h.webhookEvents.get('evt_bad_token')?.status).toBe('failed');
  });

  it('skips invoice.payment_failed when Stripe is not configured', async () => {
    const h = createHarness({ stripeConfigured: false });

    const event: Stripe.Event = {
      id: 'evt_invoice_failed_no_stripe',
      type: 'invoice.payment_failed',
      data: {
        object: makeInvoice({ id: 'in_1', subscriptionId: 'sub_1' }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.webhookEvents.get('evt_invoice_failed_no_stripe')?.status).toBe(
      'completed',
    );
  });

  it('updates subscription state and audits invoice.payment_failed when Stripe is configured', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    h.stripeSubscriptions.set(
      'sub_1',
      makeSubscription({
        id: 'sub_1',
        customer: 'cus_1',
        status: 'past_due',
        eidToken: 'enc:eid-1',
        priceLookupKey: 'pro_monthly',
        quantity: 9,
      }),
    );

    const event: Stripe.Event = {
      id: 'evt_invoice_failed',
      type: 'invoice.payment_failed',
      created: 1700000000,
      data: {
        object: makeInvoice({ id: 'in_failed', subscriptionId: 'sub_1' }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);

    const sub = h.subscriptionsByTenantId.get('t-1');
    if (!sub) {
      throw new Error('expected subscription');
    }
    expect(sub.seatLimit).toBe(9);
    expect(sub.stripeSubscriptionStatus).toBe('past_due');
    expect(sub.stripeStateUpdatedAt?.toISOString()).toBe(
      new Date(1700000000 * 1000).toISOString(),
    );
    expect(h.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'subscription.payment_failed' }),
    );
  });

  it('marks the webhook event failed when invoice.payment_failed processing throws', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    const event: Stripe.Event = {
      id: 'evt_invoice_failed_throws',
      type: 'invoice.payment_failed',
      data: {
        object: makeInvoice({
          id: 'in_failed_throws',
          subscriptionId: 'sub_missing',
        }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).rejects.toThrow(
      'subscription not found: sub_missing',
    );
    expect(h.webhookEvents.get('evt_invoice_failed_throws')?.status).toBe(
      'failed',
    );
  });

  it('audits charge.refunded when a binding exists', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });
    h.seedBinding({
      tenantId: 't-1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    });

    const event: Stripe.Event = {
      id: 'evt_refunded',
      type: 'charge.refunded',
      data: {
        object: makeCharge({
          id: 'ch_1',
          customerId: 'cus_1',
          amountRefunded: 123,
        }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);

    expect(h.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'subscription.refunded' }),
    );
  });

  it('skips charge.refunded when missing a customer', async () => {
    const h = createHarness();

    const event: Stripe.Event = {
      id: 'evt_refunded_missing_customer',
      type: 'charge.refunded',
      data: { object: makeCharge({ id: 'ch_missing', customerId: null }) },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.auditService.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'subscription.refunded' }),
    );
  });

  it('skips charge.refunded when no binding exists for the customer', async () => {
    const h = createHarness();

    const event: Stripe.Event = {
      id: 'evt_refunded_no_binding',
      type: 'charge.refunded',
      data: { object: makeCharge({ id: 'ch_1', customerId: 'cus_1' }) },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.auditService.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'subscription.refunded' }),
    );
  });

  it('audits disputes by resolving customer from charge', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });
    h.seedBinding({
      tenantId: 't-1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    });
    h.stripeCharges.set(
      'ch_1',
      makeCharge({ id: 'ch_1', customerId: 'cus_1' }),
    );

    const createdEvent: Stripe.Event = {
      id: 'evt_dispute_created',
      type: 'charge.dispute.created',
      data: {
        object: {
          id: 'dp_1',
          reason: 'fraudulent',
          status: 'needs_response',
          charge: 'ch_1',
        },
      },
    } as unknown as Stripe.Event;

    const closedEvent: Stripe.Event = {
      id: 'evt_dispute_closed',
      type: 'charge.dispute.closed',
      data: {
        object: {
          id: 'dp_1',
          reason: 'fraudulent',
          status: 'lost',
          charge: 'ch_1',
        },
      },
    } as unknown as Stripe.Event;

    await h.service.process(createdEvent);
    await h.service.process(closedEvent);

    expect(h.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'subscription.dispute_opened' }),
    );
    expect(h.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'subscription.dispute_closed' }),
    );
  });

  it('skips dispute auditing when Stripe is not configured', async () => {
    const h = createHarness({ stripeConfigured: false });

    const createdEvent: Stripe.Event = {
      id: 'evt_dispute_no_stripe',
      type: 'charge.dispute.created',
      data: {
        object: {
          id: 'dp_1',
          reason: 'fraudulent',
          status: 'needs_response',
          charge: 'ch_1',
        },
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(createdEvent)).resolves.not.toThrow();
    expect(h.webhookEvents.get('evt_dispute_no_stripe')?.status).toBe(
      'completed',
    );
  });

  it('skips dispute auditing when there is no binding for the resolved customer', async () => {
    const h = createHarness();
    h.stripeCharges.set(
      'ch_1',
      makeCharge({ id: 'ch_1', customerId: 'cus_1' }),
    );

    const createdEvent: Stripe.Event = {
      id: 'evt_dispute_no_binding',
      type: 'charge.dispute.created',
      data: {
        object: {
          id: 'dp_1',
          reason: 'fraudulent',
          status: 'needs_response',
          charge: { id: 'ch_1' },
        },
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(createdEvent)).resolves.not.toThrow();
    expect(h.auditService.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'subscription.dispute_opened' }),
    );
  });

  it('marks checkout sessions expired and audits when tenant can be resolved', async () => {
    const h = createHarness();
    h.addTenant({ id: 't-1', eid: 'eid-1' });

    const event: Stripe.Event = {
      id: 'evt_expired',
      type: 'checkout.session.expired',
      data: {
        object: makeCheckoutSession({
          id: 'cs_expired',
          paymentStatus: 'unpaid',
          customerId: 'cus_1',
          subscriptionId: 'sub_1',
          eidToken: 'enc:eid-1',
        }),
      },
    } as unknown as Stripe.Event;

    await h.service.process(event);

    expect(h.checkoutSessionExpired.has('cs_expired')).toBe(true);
    expect(h.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'checkout.expired' }),
    );
  });

  it('marks checkout sessions expired but does not audit when tenant cannot be resolved', async () => {
    const h = createHarness();

    const event: Stripe.Event = {
      id: 'evt_expired_no_tenant',
      type: 'checkout.session.expired',
      data: {
        object: makeCheckoutSession({
          id: 'cs_expired_no_tenant',
          paymentStatus: 'unpaid',
          customerId: 'cus_1',
          subscriptionId: 'sub_1',
        }),
      },
    } as unknown as Stripe.Event;

    await expect(h.service.process(event)).resolves.not.toThrow();
    expect(h.checkoutSessionExpired.has('cs_expired_no_tenant')).toBe(true);
    expect(h.auditService.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'checkout.expired' }),
    );
  });
});
