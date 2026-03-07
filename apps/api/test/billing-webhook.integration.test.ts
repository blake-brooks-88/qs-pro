import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from '@qpp/backend-shared';
import type { Sql } from 'postgres';
import type Stripe from 'stripe';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppModule } from '../src/app.module';
import { STRIPE_CLIENT } from '../src/billing/stripe.provider';
import { WebhookHandlerService } from '../src/billing/webhook-handler.service';
import { configureApp } from '../src/configure-app';
import { FeaturesService } from '../src/features/features.service';
import { deleteTestTenantSubscription } from './helpers/set-test-tenant-tier';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- trusted key
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

// ─── Stripe SDK Mock ────────────────────────────────────────────────
// Only the Stripe SDK is mocked (external boundary).
// Everything else — NestJS app, PostgreSQL, RLS, repositories — is real.

const STRIPE_PRODUCT_ID = 'prod_test_integ_001';
const PERIOD_END_EPOCH = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days out
let stripeRefCounter = 0;

type StripeRefs = {
  customerId: string;
  subscriptionId: string;
};

function makeStripeRefs(label: string): StripeRefs {
  stripeRefCounter += 1;
  return {
    customerId: `cus_test_integ_${label}_${stripeRefCounter}`,
    subscriptionId: `sub_test_integ_${label}_${stripeRefCounter}`,
  };
}

function makeProPrice(product = STRIPE_PRODUCT_ID) {
  return {
    id: 'price_pro_monthly_test',
    lookup_key: 'pro_monthly',
    product,
    recurring: { interval: 'month' },
  };
}

function makeEnterprisePrice(product = STRIPE_PRODUCT_ID) {
  return {
    id: 'price_enterprise_monthly_test',
    lookup_key: 'enterprise_monthly',
    product,
    recurring: { interval: 'month' },
  };
}

function createStripeMock() {
  return {
    webhooks: {
      constructEvent: vi.fn(),
    },
    checkout: {
      sessions: { create: vi.fn() },
    },
    prices: {
      list: vi.fn(),
    },
    products: {
      retrieve: vi.fn().mockResolvedValue({
        id: STRIPE_PRODUCT_ID,
        metadata: { tier: 'pro' },
      }),
    },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        id: 'sub_test_integ_default',
        customer: 'cus_test_integ_default',
        status: 'active',
        metadata: {}, // eid will be set per test
        items: {
          data: [
            {
              price: makeProPrice(),
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      }),
    },
    charges: {
      retrieve: vi.fn(),
    },
    billingPortal: {
      sessions: { create: vi.fn() },
    },
  };
}

describe('Billing Webhook (integration)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;
  let webhookHandler: WebhookHandlerService;
  let featuresService: FeaturesService;
  let encryptionService: EncryptionService;
  let stripeMock: ReturnType<typeof createStripeMock>;

  const createdTenantIds: string[] = [];
  let eventCounter = 0;

  function nextEventId(): string {
    return `evt_integ_${Date.now()}_${++eventCounter}`;
  }

  async function createTestTenant(suffix: string): Promise<{
    id: string;
    eid: string;
    encryptedEid: string;
  }> {
    const eid = `billing-integ-${suffix}-${Date.now()}`;
    const rows = await sqlClient`
      INSERT INTO tenants (eid, tssd) VALUES (${eid}, 'test-tssd') RETURNING id
    `;
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to insert test tenant');
    }
    createdTenantIds.push(row.id);

    const encryptedEid = encryptionService.encrypt(eid) as string;
    return { id: row.id, eid, encryptedEid };
  }

  async function getSubscription(
    tenantId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      const [row] = await reserved`
        SELECT id, tenant_id AS "tenantId", tier,
               trial_ends_at AS "trialEndsAt",
               stripe_customer_id AS "stripeCustomerId",
               stripe_subscription_id AS "stripeSubscriptionId",
               stripe_subscription_status AS "stripeSubscriptionStatus",
               current_period_ends AS "currentPeriodEnds",
               last_invoice_paid_at AS "lastInvoicePaidAt",
               seat_limit AS "seatLimit"
        FROM org_subscriptions WHERE tenant_id = ${tenantId}::uuid
      `;
      return row ?? undefined;
    } finally {
      try {
        await reserved`RESET app.tenant_id`;
      } catch {
        // ignore
      }
      reserved.release();
    }
  }

  async function countSubscriptions(tenantId: string): Promise<number> {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      const [row] = await reserved`
        SELECT count(*)::int AS count FROM org_subscriptions
        WHERE tenant_id = ${tenantId}::uuid
      `;
      return (row?.count as number) ?? 0;
    } finally {
      try {
        await reserved`RESET app.tenant_id`;
      } catch {
        // ignore
      }
      reserved.release();
    }
  }

  async function setSubscriptionState(
    tenantId: string,
    data: {
      tier: string;
      trialEndsAt?: Date | null;
      stripeSubscriptionId?: string | null;
      stripeCustomerId?: string | null;
      currentPeriodEnds?: Date | null;
      stripeSubscriptionStatus?:
        | 'inactive'
        | 'trialing'
        | 'active'
        | 'past_due'
        | 'unpaid'
        | 'canceled';
      lastInvoicePaidAt?: Date | null;
      stripeStateUpdatedAt?: Date | null;
    },
  ): Promise<void> {
    const trialEndsAt = data.trialEndsAt?.toISOString() ?? null;
    const currentPeriodEnds = data.currentPeriodEnds?.toISOString() ?? null;
    const stripeSubId = data.stripeSubscriptionId ?? null;
    const stripeCusId = data.stripeCustomerId ?? null;
    const stripeSubscriptionStatus =
      data.stripeSubscriptionStatus ?? (stripeSubId ? 'active' : 'inactive');
    const lastInvoicePaidAt =
      data.lastInvoicePaidAt?.toISOString() ??
      (stripeSubId ? new Date().toISOString() : null);
    const stripeStateUpdatedAt =
      data.stripeStateUpdatedAt?.toISOString() ?? null;

    await sqlClient.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx`
        INSERT INTO org_subscriptions (
          tenant_id,
          tier,
          trial_ends_at,
          stripe_subscription_id,
          stripe_customer_id,
          stripe_subscription_status,
          current_period_ends,
          last_invoice_paid_at,
          stripe_state_updated_at
        )
        VALUES (
          ${tenantId}::uuid,
          ${data.tier},
          ${trialEndsAt},
          ${stripeSubId},
          ${stripeCusId},
          ${stripeSubscriptionStatus},
          ${currentPeriodEnds},
          ${lastInvoicePaidAt},
          ${stripeStateUpdatedAt}
        )
        ON CONFLICT (tenant_id) DO UPDATE SET
          tier = ${data.tier},
          trial_ends_at = ${trialEndsAt},
          stripe_subscription_id = ${stripeSubId},
          stripe_customer_id = ${stripeCusId},
          stripe_subscription_status = ${stripeSubscriptionStatus},
          current_period_ends = ${currentPeriodEnds},
          last_invoice_paid_at = ${lastInvoicePaidAt},
          stripe_state_updated_at = ${stripeStateUpdatedAt}
      `;

      if (stripeCusId || stripeSubId) {
        await tx`
          INSERT INTO stripe_billing_bindings (
            tenant_id,
            stripe_customer_id,
            stripe_subscription_id
          )
          VALUES (${tenantId}::uuid, ${stripeCusId}, ${stripeSubId})
          ON CONFLICT (tenant_id) DO UPDATE SET
            stripe_customer_id = ${stripeCusId},
            stripe_subscription_id = ${stripeSubId},
            updated_at = now()
        `;
      } else {
        await tx`
          DELETE FROM stripe_billing_bindings
          WHERE tenant_id = ${tenantId}::uuid
        `;
      }
    });
  }

  function makeCheckoutEvent(
    encryptedEid: string,
    refs: StripeRefs,
    eventId?: string,
    created?: number,
  ): Stripe.Event {
    return {
      id: eventId ?? nextEventId(),
      created: created ?? Math.floor(Date.now() / 1000),
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          customer: refs.customerId,
          subscription: refs.subscriptionId,
          metadata: { eid: encryptedEid },
          payment_status: 'paid',
        },
      },
    } as unknown as Stripe.Event;
  }

  function makeSubscriptionCreatedEvent(
    encryptedEid: string,
    refs: StripeRefs,
    eventId?: string,
    created?: number,
    status: string = 'active',
  ): Stripe.Event {
    return {
      id: eventId ?? nextEventId(),
      created: created ?? Math.floor(Date.now() / 1000),
      type: 'customer.subscription.created',
      data: {
        object: {
          id: refs.subscriptionId,
          customer: refs.customerId,
          status,
          metadata: { eid: encryptedEid },
          items: {
            data: [
              {
                price: makeProPrice(),
                quantity: 1,
                current_period_end: PERIOD_END_EPOCH,
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event;
  }

  function makeSubscriptionDeletedEvent(
    encryptedEid: string,
    refs: StripeRefs,
    eventId?: string,
    created?: number,
  ): Stripe.Event {
    return {
      id: eventId ?? nextEventId(),
      created: created ?? Math.floor(Date.now() / 1000),
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: refs.subscriptionId,
          customer: refs.customerId,
          status: 'canceled',
          metadata: { eid: encryptedEid },
          items: {
            data: [
              {
                price: makeProPrice(),
                quantity: 1,
                current_period_end: PERIOD_END_EPOCH,
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event;
  }

  function makeSubscriptionUpdatedEvent(
    encryptedEid: string,
    refs: StripeRefs,
    overrides?: { currentPeriodEnd?: number },
    eventId?: string,
    created?: number,
  ): Stripe.Event {
    return {
      id: eventId ?? nextEventId(),
      created: created ?? Math.floor(Date.now() / 1000),
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: refs.subscriptionId,
          customer: refs.customerId,
          status: 'active',
          metadata: { eid: encryptedEid },
          items: {
            data: [
              {
                price: makeProPrice(),
                quantity: 1,
                current_period_end:
                  overrides?.currentPeriodEnd ?? PERIOD_END_EPOCH,
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event;
  }

  function makeInvoicePaidEvent(
    refs: StripeRefs,
    eventId?: string,
    created?: number,
  ): Stripe.Event {
    return {
      id: eventId ?? nextEventId(),
      created: created ?? Math.floor(Date.now() / 1000),
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_test_integ_001',
          parent: {
            subscription_details: {
              subscription: refs.subscriptionId,
            },
          },
        },
      },
    } as unknown as Stripe.Event;
  }

  beforeAll(async () => {
    stripeMock = createStripeMock();

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(STRIPE_CLIENT)
      .useValue(stripeMock)
      .compile();

    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await configureApp(app, {
      globalPrefix: false,
      session: {
        secret: getRequiredEnv('SESSION_SECRET'),
        salt: getRequiredEnv('SESSION_SALT'),
        cookie: { secure: false, sameSite: 'lax' },
      },
      rls: true,
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    sqlClient = app.get<Sql>('SQL_CLIENT');
    webhookHandler = app.get(WebhookHandlerService);
    featuresService = app.get(FeaturesService);
    encryptionService = app.get(EncryptionService);
  });

  beforeEach(() => {
    // Reset Stripe mock return values to defaults before each test
    stripeMock.products.retrieve.mockResolvedValue({
      id: STRIPE_PRODUCT_ID,
      metadata: { tier: 'pro' },
    });
    stripeMock.subscriptions.retrieve.mockImplementation((subId: string) =>
      Promise.resolve({
        id: subId,
        customer: 'cus_test_integ_default',
        status: 'active',
        metadata: {}, // overridden per-test via the event's own metadata
        items: {
          data: [
            {
              price: makeProPrice(),
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      }),
    );
  });

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      try {
        // Clean up webhook events for this tenant's tests
        await sqlClient`
          DELETE FROM stripe_webhook_events
          WHERE id LIKE 'evt_integ_%'
        `;
        await deleteTestTenantSubscription(sqlClient, tenantId);
        await sqlClient`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
      } catch {
        // Best-effort cleanup
      }
    }
    await app.close();
    await sqlClient.end({ timeout: 5 });
  });

  // ─── checkout.session.completed ─────────────────────────────────

  describe('checkout.session.completed', () => {
    it('creates pro subscription for free tenant with no prior row', async () => {
      const tenant = await createTestTenant('checkout-new');
      const refs = makeStripeRefs('checkout-new');

      // Tenant has no org_subscriptions row at all
      const before = await getSubscription(tenant.id);
      expect(before).toBeUndefined();

      // Set the Stripe mock to return the encrypted EID when subscription is retrieved
      stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
        id: refs.subscriptionId,
        customer: refs.customerId,
        status: 'active',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: makeProPrice(),
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      await webhookHandler.process(
        makeCheckoutEvent(tenant.encryptedEid, refs),
      );

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(refs.customerId);
      expect(sub.stripeSubscriptionId).toBe(refs.subscriptionId);
      expect(sub.trialEndsAt).toBeNull();
    });

    it('grants pro features after successful checkout completion', async () => {
      const tenant = await createTestTenant('checkout-features');
      const refs = makeStripeRefs('checkout-features');

      stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
        id: refs.subscriptionId,
        customer: refs.customerId,
        status: 'active',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: makeProPrice(),
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      await webhookHandler.process(
        makeCheckoutEvent(tenant.encryptedEid, refs),
      );

      const features = await featuresService.getTenantFeatures(tenant.id);

      expect(features.tier).toBe('pro');
      expect(features.features.advancedAutocomplete).toBe(true);
      expect(features.features.deployToAutomation).toBe(true);
    });

    it('upgrades trial tenant to paid pro, clearing trial', async () => {
      const tenant = await createTestTenant('checkout-trial');
      const refs = makeStripeRefs('checkout-trial');
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        trialEndsAt: futureDate,
      });

      stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
        id: refs.subscriptionId,
        customer: refs.customerId,
        status: 'active',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: makeProPrice(),
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      await webhookHandler.process(
        makeCheckoutEvent(tenant.encryptedEid, refs),
      );

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(refs.customerId);
      expect(sub.stripeSubscriptionId).toBe(refs.subscriptionId);
      expect(sub.trialEndsAt).toBeNull();
    });

    it('ignores payment-mode checkout sessions without failing the webhook job', async () => {
      const event = {
        id: nextEventId(),
        created: Math.floor(Date.now() / 1000),
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_payment_mode',
            mode: 'payment',
            payment_status: 'paid',
            customer: 'cus_payment_mode',
            metadata: {},
          },
        },
      } as unknown as Stripe.Event;

      await expect(webhookHandler.process(event)).resolves.not.toThrow();
    });
  });

  // ─── customer.subscription.created ──────────────────────────────

  describe('customer.subscription.created', () => {
    it('creates subscription row when processed before checkout event', async () => {
      const tenant = await createTestTenant('sub-created-first');
      const refs = makeStripeRefs('sub-created-first');

      await webhookHandler.process(
        makeSubscriptionCreatedEvent(tenant.encryptedEid, refs),
      );

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(refs.customerId);
      expect(sub.stripeSubscriptionId).toBe(refs.subscriptionId);
      expect(sub.trialEndsAt).toBeNull();
      expect(sub.currentPeriodEnds).toBeDefined();
    });

    it('updates existing subscription when checkout already processed', async () => {
      const tenant = await createTestTenant('sub-created-after');
      const refs = makeStripeRefs('sub-created-after');

      // Simulate checkout already processed
      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: refs.customerId,
        stripeSubscriptionId: refs.subscriptionId,
        currentPeriodEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastInvoicePaidAt: new Date(),
      });

      await webhookHandler.process(
        makeSubscriptionCreatedEvent(tenant.encryptedEid, refs),
      );

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.currentPeriodEnds).toBeDefined();
      const count = await countSubscriptions(tenant.id);
      expect(count).toBe(1);
    });

    it('ignores a stale incomplete created event after a newer active state was stored', async () => {
      const tenant = await createTestTenant('sub-created-stale-incomplete');
      const refs = makeStripeRefs('sub-created-stale-incomplete');

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: refs.customerId,
        stripeSubscriptionId: refs.subscriptionId,
        stripeSubscriptionStatus: 'active',
        currentPeriodEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastInvoicePaidAt: new Date(),
        stripeStateUpdatedAt: new Date('2026-03-07T12:00:00.000Z'),
      });

      await webhookHandler.process(
        makeSubscriptionCreatedEvent(
          tenant.encryptedEid,
          refs,
          undefined,
          Math.floor(new Date('2026-03-07T11:00:00.000Z').getTime() / 1000),
          'incomplete',
        ),
      );

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.stripeSubscriptionStatus).toBe('active');

      const features = await featuresService.getTenantFeatures(tenant.id);
      expect(features.tier).toBe('pro');
    });
  });

  // ─── customer.subscription.updated (plan switch) ───────────────

  describe('customer.subscription.updated', () => {
    it('updates currentPeriodEnds and preserves tier on interval change', async () => {
      const tenant = await createTestTenant('sub-updated-interval');
      const refs = makeStripeRefs('sub-updated-interval');
      const annualPeriodEnd =
        Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: refs.customerId,
        stripeSubscriptionId: refs.subscriptionId,
        currentPeriodEnds: new Date(annualPeriodEnd * 1000),
        lastInvoicePaidAt: new Date(),
      });

      const monthlyPeriodEnd =
        Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      await webhookHandler.process(
        makeSubscriptionUpdatedEvent(tenant.encryptedEid, refs, {
          currentPeriodEnd: monthlyPeriodEnd,
        }),
      );

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(refs.customerId);
      expect(sub.stripeSubscriptionId).toBe(refs.subscriptionId);
      expect(sub.trialEndsAt).toBeNull();
      const periodEnds = new Date(sub.currentPeriodEnds as string);
      const expectedPeriodEnds = new Date(monthlyPeriodEnd * 1000);
      expect(periodEnds.getFullYear()).toBe(expectedPeriodEnds.getFullYear());
      expect(periodEnds.getMonth()).toBe(expectedPeriodEnds.getMonth());
    });

    it('preserves tier when subscription status is past_due (grace period)', async () => {
      // Arrange — tenant on 'enterprise' tier, but the Stripe product
      // resolves to 'pro'. Under past_due grace, the tier must NOT be
      // overwritten; it must stay 'enterprise'.
      const tenant = await createTestTenant('sub-updated-past-due');
      const refs = makeStripeRefs('sub-updated-past-due');
      const ENTERPRISE_PRODUCT_ID = 'prod_test_enterprise_pd';
      const originalPeriodEnd =
        Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60;

      await setSubscriptionState(tenant.id, {
        tier: 'enterprise',
        stripeCustomerId: refs.customerId,
        stripeSubscriptionId: refs.subscriptionId,
        currentPeriodEnds: new Date(originalPeriodEnd * 1000),
        lastInvoicePaidAt: new Date(),
      });

      const newPeriodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      // Act — send subscription.updated with status='past_due'
      await webhookHandler.process({
        id: nextEventId(),
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: refs.subscriptionId,
            customer: refs.customerId,
            status: 'past_due',
            metadata: { eid: tenant.encryptedEid },
            items: {
              data: [
                {
                  price: makeEnterprisePrice(ENTERPRISE_PRODUCT_ID),
                  quantity: 1,
                  current_period_end: newPeriodEnd,
                },
              ],
            },
          },
        },
      } as unknown as Stripe.Event);

      // Assert — tier must remain 'enterprise' (NOT overwritten to 'pro')
      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('enterprise');
      expect(sub.stripeCustomerId).toBe(refs.customerId);
      expect(sub.stripeSubscriptionId).toBe(refs.subscriptionId);
      expect(sub.trialEndsAt).toBeNull();
      const periodEnds = new Date(sub.currentPeriodEnds as string);
      const expectedPeriodEnds = new Date(newPeriodEnd * 1000);
      expect(periodEnds.getFullYear()).toBe(expectedPeriodEnds.getFullYear());
      expect(periodEnds.getMonth()).toBe(expectedPeriodEnds.getMonth());
    });
  });

  // ─── Concurrent webhook processing (race condition) ─────────────

  describe('checkout + subscription concurrent processing', () => {
    it('both webhooks succeed when processed concurrently for same tenant', async () => {
      const tenant = await createTestTenant('race-condition');
      const refs = makeStripeRefs('race-condition');

      // No subscription row exists — both webhooks will try to create one
      const before = await getSubscription(tenant.id);
      expect(before).toBeUndefined();

      // Mock Stripe subscription retrieval for the checkout handler
      stripeMock.subscriptions.retrieve.mockResolvedValue({
        id: refs.subscriptionId,
        customer: refs.customerId,
        status: 'active',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: makeProPrice(),
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      const checkoutEvent = makeCheckoutEvent(tenant.encryptedEid, refs);
      const subscriptionEvent = makeSubscriptionCreatedEvent(
        tenant.encryptedEid,
        refs,
      );

      // Process BOTH events concurrently — this is the race condition scenario
      const results = await Promise.allSettled([
        webhookHandler.process(checkoutEvent),
        webhookHandler.process(subscriptionEvent),
      ]);

      // BOTH must succeed — no 500 errors
      for (const result of results) {
        expect(result.status).toBe('fulfilled');
      }

      // Exactly 1 subscription row, not 0 or 2
      const count = await countSubscriptions(tenant.id);
      expect(count).toBe(1);

      // Final state is correct
      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(refs.customerId);
      expect(sub.stripeSubscriptionId).toBe(refs.subscriptionId);
      expect(sub.trialEndsAt).toBeNull();
    });
  });

  // ─── invoice.paid ───────────────────────────────────────────────

  describe('invoice.paid', () => {
    it('updates currentPeriodEnds for existing subscription', async () => {
      const tenant = await createTestTenant('invoice-paid');
      const refs = makeStripeRefs('invoice-paid');
      const initialPeriodEnds = new Date('2025-01-01T00:00:00Z');

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: refs.customerId,
        stripeSubscriptionId: refs.subscriptionId,
        currentPeriodEnds: initialPeriodEnds,
        lastInvoicePaidAt: new Date('2024-12-01T00:00:00Z'),
      });

      // Mock subscription retrieval for invoice.paid handler
      stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
        id: refs.subscriptionId,
        customer: refs.customerId,
        status: 'active',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: makeProPrice(),
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      await webhookHandler.process(makeInvoicePaidEvent(refs));

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      const periodEnds = new Date(sub.currentPeriodEnds as string);
      expect(periodEnds.getTime()).not.toBe(initialPeriodEnds.getTime());
      const expectedPeriodEnds = new Date(PERIOD_END_EPOCH * 1000);
      expect(periodEnds.getFullYear()).toBe(expectedPeriodEnds.getFullYear());
      expect(periodEnds.getMonth()).toBe(expectedPeriodEnds.getMonth());
    });
  });

  // ─── customer.subscription.deleted ──────────────────────────────

  describe('customer.subscription.deleted', () => {
    it('downgrades tier to free and prevents trial re-provisioning', async () => {
      const tenant = await createTestTenant('sub-deleted');
      const refs = makeStripeRefs('sub-deleted');

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: refs.customerId,
        stripeSubscriptionId: refs.subscriptionId,
        currentPeriodEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastInvoicePaidAt: new Date(),
      });

      await webhookHandler.process(
        makeSubscriptionDeletedEvent(tenant.encryptedEid, refs),
      );

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('free');
      expect(sub.stripeCustomerId).toBeNull();
      expect(sub.stripeSubscriptionId).toBeNull();
      expect(sub.currentPeriodEnds).toBeNull();
      expect(sub.trialEndsAt).not.toBeNull();
    });

    it('allows re-subscription after cancellation', async () => {
      const tenant = await createTestTenant('sub-deleted-resub');
      const previousRefs = makeStripeRefs('sub-deleted-resub-old');
      const newRefs = makeStripeRefs('sub-deleted-resub-new');

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: previousRefs.customerId,
        stripeSubscriptionId: previousRefs.subscriptionId,
        currentPeriodEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastInvoicePaidAt: new Date(),
      });

      await webhookHandler.process(
        makeSubscriptionDeletedEvent(tenant.encryptedEid, previousRefs),
      );

      stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
        id: newRefs.subscriptionId,
        customer: newRefs.customerId,
        status: 'active',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: makeProPrice(),
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      await webhookHandler.process({
        id: nextEventId(),
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: newRefs.customerId,
            subscription: newRefs.subscriptionId,
            metadata: { eid: tenant.encryptedEid },
            payment_status: 'paid',
          },
        },
      } as unknown as Stripe.Event);

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(newRefs.customerId);
      expect(sub.stripeSubscriptionId).toBe(newRefs.subscriptionId);
    });
  });

  // ─── Out-of-order re-subscription (stale binding) ──────────────

  describe('re-subscription with stale bindings (out-of-order webhooks)', () => {
    it('checkout.session.completed overrides stale old Stripe bindings', async () => {
      const tenant = await createTestTenant('stale-binding-checkout');
      const oldRefs = makeStripeRefs('stale-binding-checkout-old');
      const newRefs = makeStripeRefs('stale-binding-checkout-new');

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: oldRefs.customerId,
        stripeSubscriptionId: oldRefs.subscriptionId,
        currentPeriodEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastInvoicePaidAt: new Date(),
      });

      stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
        id: newRefs.subscriptionId,
        customer: newRefs.customerId,
        status: 'active',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: makeProPrice(),
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      await webhookHandler.process({
        id: nextEventId(),
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: newRefs.customerId,
            subscription: newRefs.subscriptionId,
            metadata: { eid: tenant.encryptedEid },
            payment_status: 'paid',
          },
        },
      } as unknown as Stripe.Event);

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(newRefs.customerId);
      expect(sub.stripeSubscriptionId).toBe(newRefs.subscriptionId);
      expect(sub.trialEndsAt).toBeNull();
    });

    it('old subscription.deleted is rejected after new checkout binds', async () => {
      const tenant = await createTestTenant('stale-deleted-after-rebind');
      const oldRefs = makeStripeRefs('stale-deleted-after-rebind-old');
      const newRefs = makeStripeRefs('stale-deleted-after-rebind-new');

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: newRefs.customerId,
        stripeSubscriptionId: newRefs.subscriptionId,
        currentPeriodEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastInvoicePaidAt: new Date(),
      });

      await webhookHandler.process(
        makeSubscriptionDeletedEvent(tenant.encryptedEid, oldRefs),
      );

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(newRefs.customerId);
      expect(sub.stripeSubscriptionId).toBe(newRefs.subscriptionId);
    });

    it('subscription.created overrides stale old Stripe bindings', async () => {
      const tenant = await createTestTenant('stale-binding-sub-created');
      const oldRefs = makeStripeRefs('stale-binding-sub-created-old');
      const newRefs = makeStripeRefs('stale-binding-sub-created-new');

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: oldRefs.customerId,
        stripeSubscriptionId: oldRefs.subscriptionId,
        currentPeriodEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastInvoicePaidAt: new Date(),
      });

      await webhookHandler.process({
        id: nextEventId(),
        type: 'customer.subscription.created',
        data: {
          object: {
            id: newRefs.subscriptionId,
            customer: newRefs.customerId,
            status: 'active',
            metadata: { eid: tenant.encryptedEid },
            items: {
              data: [
                {
                  price: makeProPrice(),
                  quantity: 1,
                  current_period_end: PERIOD_END_EPOCH,
                },
              ],
            },
          },
        },
      } as unknown as Stripe.Event);

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(newRefs.customerId);
      expect(sub.stripeSubscriptionId).toBe(newRefs.subscriptionId);
    });

    it('subscription.updated with mismatched customer is rejected and audited', async () => {
      const tenant = await createTestTenant('stale-binding-updated-conflict');
      const existingRefs = makeStripeRefs('stale-binding-updated-conflict');
      const INTRUDER_CUSTOMER_ID = 'cus_intruder_999';
      const INTRUDER_SUBSCRIPTION_ID = 'sub_intruder_999';
      const periodEnds = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: existingRefs.customerId,
        stripeSubscriptionId: existingRefs.subscriptionId,
        currentPeriodEnds: periodEnds,
        lastInvoicePaidAt: new Date(),
      });

      // Act — send subscription.updated with a DIFFERENT customer ID
      await webhookHandler.process({
        id: nextEventId(),
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: INTRUDER_SUBSCRIPTION_ID,
            customer: INTRUDER_CUSTOMER_ID,
            status: 'active',
            metadata: { eid: tenant.encryptedEid },
            items: {
              data: [
                {
                  price: makeProPrice(),
                  quantity: 1,
                  current_period_end: PERIOD_END_EPOCH,
                },
              ],
            },
          },
        },
      } as unknown as Stripe.Event);

      // Assert — subscription state must be UNCHANGED
      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(existingRefs.customerId);
      expect(sub.stripeSubscriptionId).toBe(existingRefs.subscriptionId);

      // Assert — audit log entry for the conflict
      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${tenant.id}, false)`;
        await reserved`SELECT set_config('app.mid', 'system', false)`;
        const [auditRow] = await reserved`
          SELECT event_type, tenant_id, metadata
          FROM audit_logs
          WHERE tenant_id = ${tenant.id}::uuid
            AND event_type = 'subscription.webhook_conflict'
          ORDER BY created_at DESC
          LIMIT 1
        `;
        if (!auditRow) {
          throw new Error('Expected audit log row to exist');
        }
        expect(auditRow.event_type).toBe('subscription.webhook_conflict');
        const meta = auditRow.metadata as Record<string, unknown>;
        expect(meta.eventType).toBe('customer.subscription.updated');
        expect(meta.incomingStripeCustomerId).toBe(INTRUDER_CUSTOMER_ID);
        expect(meta.existingStripeCustomerId).toBe(existingRefs.customerId);
      } finally {
        try {
          await reserved`RESET app.tenant_id`;
          await reserved`RESET app.mid`;
        } catch {
          // ignore
        }
        reserved.release();
      }
    });
  });

  // ─── invoice.payment_failed ──────────────────────────────────

  describe('invoice.payment_failed', () => {
    it('logs audit event without changing subscription state', async () => {
      const tenant = await createTestTenant('payment-failed');
      const refs = makeStripeRefs('payment-failed');
      const periodEnds = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: refs.customerId,
        stripeSubscriptionId: refs.subscriptionId,
        currentPeriodEnds: periodEnds,
        lastInvoicePaidAt: new Date(),
      });

      stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
        id: refs.subscriptionId,
        customer: refs.customerId,
        status: 'past_due',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: makeProPrice(),
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      const event: Stripe.Event = {
        id: nextEventId(),
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test_failed_001',
            parent: {
              subscription_details: {
                subscription: refs.subscriptionId,
              },
            },
          },
        },
      } as unknown as Stripe.Event;

      await webhookHandler.process(event);

      // Subscription state must be UNCHANGED — no tier downgrade, no binding changes
      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(refs.customerId);
      expect(sub.stripeSubscriptionId).toBe(refs.subscriptionId);
      expect(sub.stripeSubscriptionStatus).toBe('past_due');

      // Audit log entry was written (RLS requires both tenant_id and mid)
      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${tenant.id}, false)`;
        await reserved`SELECT set_config('app.mid', 'system', false)`;
        const [auditRow] = await reserved`
          SELECT event_type, tenant_id, metadata
          FROM audit_logs
          WHERE tenant_id = ${tenant.id}::uuid
            AND event_type = 'subscription.payment_failed'
          ORDER BY created_at DESC
          LIMIT 1
        `;
        if (!auditRow) {
          throw new Error('Expected audit log row to exist');
        }
        expect(auditRow.event_type).toBe('subscription.payment_failed');
        expect((auditRow.metadata as Record<string, unknown>).invoiceId).toBe(
          'in_test_failed_001',
        );
      } finally {
        try {
          await reserved`RESET app.tenant_id`;
          await reserved`RESET app.mid`;
        } catch {
          // ignore
        }
        reserved.release();
      }
    });

    it('marks the webhook event failed when subscription lookup throws', async () => {
      const refs = makeStripeRefs('payment-failed-retry');
      const eventId = nextEventId();

      stripeMock.subscriptions.retrieve.mockRejectedValueOnce(
        new Error('stripe temporarily unavailable'),
      );

      await expect(
        webhookHandler.process({
          id: eventId,
          created: Math.floor(Date.now() / 1000),
          type: 'invoice.payment_failed',
          data: {
            object: {
              id: 'in_test_failed_retry',
              parent: {
                subscription_details: {
                  subscription: refs.subscriptionId,
                },
              },
            },
          },
        } as unknown as Stripe.Event),
      ).rejects.toThrow('stripe temporarily unavailable');

      const [webhookRow] = await sqlClient`
        SELECT status, error_message
        FROM stripe_webhook_events
        WHERE id = ${eventId}
      `;
      if (!webhookRow) {
        throw new Error('Expected webhook event row to exist');
      }
      expect(webhookRow.status).toBe('failed');
      expect(webhookRow.error_message).toContain(
        'stripe temporarily unavailable',
      );
    });
  });

  // ─── Checkout Session Expired ──────────────────────────────────

  describe('checkout.session.expired', () => {
    it('logs audit event without changing subscription state', async () => {
      const tenant = await createTestTenant('checkout-expired');

      // Tenant is on free tier with no Stripe bindings — simulates
      // a user who started checkout but never completed it
      await setSubscriptionState(tenant.id, { tier: 'free' });

      const event: Stripe.Event = {
        id: nextEventId(),
        type: 'checkout.session.expired',
        data: {
          object: {
            id: 'cs_test_expired_001',
            metadata: { eid: tenant.encryptedEid, tier: 'pro' },
            customer: null,
            subscription: null,
            payment_status: 'unpaid',
            status: 'expired',
          },
        },
      } as unknown as Stripe.Event;

      await webhookHandler.process(event);

      // Subscription state must be UNCHANGED — still free, no Stripe bindings
      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('free');
      expect(sub.stripeCustomerId).toBeNull();
      expect(sub.stripeSubscriptionId).toBeNull();

      // Audit log entry was written
      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${tenant.id}, false)`;
        await reserved`SELECT set_config('app.mid', 'system', false)`;
        const [auditRow] = await reserved`
          SELECT event_type, tenant_id
          FROM audit_logs
          WHERE tenant_id = ${tenant.id}::uuid
            AND event_type = 'checkout.expired'
          ORDER BY created_at DESC
          LIMIT 1
        `;
        if (!auditRow) {
          throw new Error('Expected audit log row to exist');
        }
        expect(auditRow.event_type).toBe('checkout.expired');
      } finally {
        try {
          await reserved`RESET app.tenant_id`;
          await reserved`RESET app.mid`;
        } catch {
          // ignore
        }
        reserved.release();
      }
    });

    it('skips gracefully when metadata.eid is missing', async () => {
      const event: Stripe.Event = {
        id: nextEventId(),
        type: 'checkout.session.expired',
        data: {
          object: {
            id: 'cs_test_expired_no_eid',
            metadata: {},
            customer: null,
            subscription: null,
            payment_status: 'unpaid',
            status: 'expired',
          },
        },
      } as unknown as Stripe.Event;

      // Should not throw — handler logs warning and returns
      await expect(webhookHandler.process(event)).resolves.not.toThrow();
    });
  });

  // ─── Idempotency ───────────────────────────────────────────────

  describe('webhook idempotency', () => {
    it('skips duplicate event without error', async () => {
      const tenant = await createTestTenant('idempotent');
      const refs = makeStripeRefs('idempotent');
      const eventId = nextEventId();

      stripeMock.subscriptions.retrieve.mockResolvedValue({
        id: refs.subscriptionId,
        customer: refs.customerId,
        status: 'active',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: makeProPrice(),
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      // First processing — should succeed
      await webhookHandler.process(
        makeCheckoutEvent(tenant.encryptedEid, refs, eventId),
      );

      const subAfterFirst = await getSubscription(tenant.id);
      if (!subAfterFirst) {
        throw new Error('Expected subscription to exist');
      }
      expect(subAfterFirst.tier).toBe('pro');

      // Second processing of same event ID — should be silently skipped
      await webhookHandler.process(
        makeCheckoutEvent(tenant.encryptedEid, refs, eventId),
      );

      // State unchanged, no error thrown
      const subAfterSecond = await getSubscription(tenant.id);
      if (!subAfterSecond) {
        throw new Error('Expected subscription to exist');
      }
      expect(subAfterSecond.tier).toBe('pro');
      expect(await countSubscriptions(tenant.id)).toBe(1);
    });
  });

  // ─── Encrypted EID validation ──────────────────────────────────

  describe('encrypted EID validation', () => {
    it('rejects event with tampered/garbage EID and records failure', async () => {
      // Arrange — fresh tenant with no subscription
      const tenant = await createTestTenant('garbage-eid');
      const refs = makeStripeRefs('garbage-eid');
      const eventId = nextEventId();

      const event: Stripe.Event = {
        id: eventId,
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: refs.subscriptionId,
            customer: refs.customerId,
            status: 'active',
            metadata: { eid: 'GARBAGE_TAMPERED_TOKEN' },
            items: {
              data: [
                {
                  price: makeProPrice(),
                  quantity: 1,
                  current_period_end: PERIOD_END_EPOCH,
                },
              ],
            },
          },
        },
      } as unknown as Stripe.Event;

      // Act — process() should throw because decryptEidToken rejects garbage
      await expect(webhookHandler.process(event)).rejects.toThrow(
        'Invalid metadata.eid token',
      );

      // Assert — no subscription was created for this tenant
      const sub = await getSubscription(tenant.id);
      expect(sub).toBeUndefined();

      // Assert — webhook event recorded as 'failed' with error message
      const [webhookRow] = await sqlClient`
        SELECT status, error_message
        FROM stripe_webhook_events
        WHERE id = ${eventId}
      `;
      if (!webhookRow) {
        throw new Error('Expected webhook event row to exist');
      }
      expect(webhookRow.status).toBe('failed');
      expect(webhookRow.error_message).toContain('Invalid metadata.eid token');
    });
  });
});
