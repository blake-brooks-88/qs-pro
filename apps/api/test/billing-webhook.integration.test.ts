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

const STRIPE_CUSTOMER_ID = 'cus_test_integ_001';
const STRIPE_SUBSCRIPTION_ID = 'sub_test_integ_001';
const STRIPE_PRODUCT_ID = 'prod_test_integ_001';
const PERIOD_END_EPOCH = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days out

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
        id: STRIPE_SUBSCRIPTION_ID,
        customer: STRIPE_CUSTOMER_ID,
        status: 'active',
        metadata: {}, // eid will be set per test
        items: {
          data: [
            {
              price: { product: STRIPE_PRODUCT_ID },
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
               current_period_ends AS "currentPeriodEnds",
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
    },
  ): Promise<void> {
    const trialEndsAt = data.trialEndsAt?.toISOString() ?? null;
    const currentPeriodEnds = data.currentPeriodEnds?.toISOString() ?? null;
    const stripeSubId = data.stripeSubscriptionId ?? null;
    const stripeCusId = data.stripeCustomerId ?? null;

    await sqlClient.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx`
        INSERT INTO org_subscriptions (tenant_id, tier, trial_ends_at, stripe_subscription_id, stripe_customer_id, current_period_ends)
        VALUES (
          ${tenantId}::uuid, ${data.tier}, ${trialEndsAt},
          ${stripeSubId}, ${stripeCusId}, ${currentPeriodEnds}
        )
        ON CONFLICT (tenant_id) DO UPDATE SET
          tier = ${data.tier},
          trial_ends_at = ${trialEndsAt},
          stripe_subscription_id = ${stripeSubId},
          stripe_customer_id = ${stripeCusId},
          current_period_ends = ${currentPeriodEnds}
      `;
    });
  }

  function makeCheckoutEvent(
    encryptedEid: string,
    eventId?: string,
  ): Stripe.Event {
    return {
      id: eventId ?? nextEventId(),
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: STRIPE_CUSTOMER_ID,
          subscription: STRIPE_SUBSCRIPTION_ID,
          metadata: { eid: encryptedEid },
        },
      },
    } as unknown as Stripe.Event;
  }

  function makeSubscriptionCreatedEvent(
    encryptedEid: string,
    eventId?: string,
  ): Stripe.Event {
    return {
      id: eventId ?? nextEventId(),
      type: 'customer.subscription.created',
      data: {
        object: {
          id: STRIPE_SUBSCRIPTION_ID,
          customer: STRIPE_CUSTOMER_ID,
          status: 'active',
          metadata: { eid: encryptedEid },
          items: {
            data: [
              {
                price: { product: STRIPE_PRODUCT_ID },
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
    eventId?: string,
  ): Stripe.Event {
    return {
      id: eventId ?? nextEventId(),
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: STRIPE_SUBSCRIPTION_ID,
          customer: STRIPE_CUSTOMER_ID,
          status: 'canceled',
          metadata: { eid: encryptedEid },
          items: {
            data: [
              {
                price: { product: STRIPE_PRODUCT_ID },
                quantity: 1,
                current_period_end: PERIOD_END_EPOCH,
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event;
  }

  // Fixed epoch for invoice.paid tests — avoids drift from module-load-time constants
  const INVOICE_PERIOD_END = 1900000000; // ~2030-03-17, a stable future epoch

  function makeInvoicePaidEvent(eventId?: string): Stripe.Event {
    return {
      id: eventId ?? nextEventId(),
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_test_integ_001',
          parent: {
            subscription_details: {
              subscription: STRIPE_SUBSCRIPTION_ID,
            },
          },
          period_end: INVOICE_PERIOD_END,
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
        customer: STRIPE_CUSTOMER_ID,
        status: 'active',
        metadata: {}, // overridden per-test via the event's own metadata
        items: {
          data: [
            {
              price: { product: STRIPE_PRODUCT_ID },
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
  });

  // ─── checkout.session.completed ─────────────────────────────────

  describe('checkout.session.completed', () => {
    it('creates pro subscription for free tenant with no prior row', async () => {
      const tenant = await createTestTenant('checkout-new');

      // Tenant has no org_subscriptions row at all
      const before = await getSubscription(tenant.id);
      expect(before).toBeUndefined();

      // Set the Stripe mock to return the encrypted EID when subscription is retrieved
      stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
        id: STRIPE_SUBSCRIPTION_ID,
        customer: STRIPE_CUSTOMER_ID,
        status: 'active',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: { product: STRIPE_PRODUCT_ID },
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      await webhookHandler.process(makeCheckoutEvent(tenant.encryptedEid));

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(STRIPE_CUSTOMER_ID);
      expect(sub.stripeSubscriptionId).toBe(STRIPE_SUBSCRIPTION_ID);
      expect(sub.trialEndsAt).toBeNull();
    });

    it('upgrades trial tenant to paid pro, clearing trial', async () => {
      const tenant = await createTestTenant('checkout-trial');
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        trialEndsAt: futureDate,
      });

      stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
        id: STRIPE_SUBSCRIPTION_ID,
        customer: STRIPE_CUSTOMER_ID,
        status: 'active',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: { product: STRIPE_PRODUCT_ID },
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      await webhookHandler.process(makeCheckoutEvent(tenant.encryptedEid));

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(STRIPE_CUSTOMER_ID);
      expect(sub.stripeSubscriptionId).toBe(STRIPE_SUBSCRIPTION_ID);
      expect(sub.trialEndsAt).toBeNull();
    });
  });

  // ─── customer.subscription.created ──────────────────────────────

  describe('customer.subscription.created', () => {
    it('creates subscription row when processed before checkout event', async () => {
      const tenant = await createTestTenant('sub-created-first');

      await webhookHandler.process(
        makeSubscriptionCreatedEvent(tenant.encryptedEid),
      );

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeCustomerId).toBe(STRIPE_CUSTOMER_ID);
      expect(sub.stripeSubscriptionId).toBe(STRIPE_SUBSCRIPTION_ID);
      expect(sub.trialEndsAt).toBeNull();
      expect(sub.currentPeriodEnds).toBeDefined();
    });

    it('updates existing subscription when checkout already processed', async () => {
      const tenant = await createTestTenant('sub-created-after');

      // Simulate checkout already processed
      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: STRIPE_CUSTOMER_ID,
        stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
      });

      await webhookHandler.process(
        makeSubscriptionCreatedEvent(tenant.encryptedEid),
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
  });

  // ─── Concurrent webhook processing (race condition) ─────────────

  describe('checkout + subscription concurrent processing', () => {
    it('both webhooks succeed when processed concurrently for same tenant', async () => {
      const tenant = await createTestTenant('race-condition');

      // No subscription row exists — both webhooks will try to create one
      const before = await getSubscription(tenant.id);
      expect(before).toBeUndefined();

      // Mock Stripe subscription retrieval for the checkout handler
      stripeMock.subscriptions.retrieve.mockResolvedValue({
        id: STRIPE_SUBSCRIPTION_ID,
        customer: STRIPE_CUSTOMER_ID,
        status: 'active',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: { product: STRIPE_PRODUCT_ID },
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      const checkoutEvent = makeCheckoutEvent(tenant.encryptedEid);
      const subscriptionEvent = makeSubscriptionCreatedEvent(
        tenant.encryptedEid,
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
      expect(sub.stripeCustomerId).toBe(STRIPE_CUSTOMER_ID);
      expect(sub.stripeSubscriptionId).toBe(STRIPE_SUBSCRIPTION_ID);
      expect(sub.trialEndsAt).toBeNull();
    });
  });

  // ─── invoice.paid ───────────────────────────────────────────────

  describe('invoice.paid', () => {
    it('updates currentPeriodEnds for existing subscription', async () => {
      const tenant = await createTestTenant('invoice-paid');
      const initialPeriodEnds = new Date('2025-01-01T00:00:00Z');

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: STRIPE_CUSTOMER_ID,
        stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
        currentPeriodEnds: initialPeriodEnds,
      });

      // Mock subscription retrieval for invoice.paid handler
      stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
        id: STRIPE_SUBSCRIPTION_ID,
        customer: STRIPE_CUSTOMER_ID,
        status: 'active',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: { product: STRIPE_PRODUCT_ID },
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      await webhookHandler.process(makeInvoicePaidEvent());

      const sub = await getSubscription(tenant.id);
      expect(sub).toBeDefined();
      // currentPeriodEnds must have changed from the initial value
      const periodEnds = new Date(sub.currentPeriodEnds as string);
      expect(periodEnds.getTime()).not.toBe(initialPeriodEnds.getTime());
      // The updated value should be in the future (from INVOICE_PERIOD_END ~2030)
      expect(periodEnds.getFullYear()).toBeGreaterThanOrEqual(2030);
    });
  });

  // ─── customer.subscription.deleted ──────────────────────────────

  describe('customer.subscription.deleted', () => {
    it('downgrades tier to free and clears Stripe subscription ID', async () => {
      const tenant = await createTestTenant('sub-deleted');

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: STRIPE_CUSTOMER_ID,
        stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
        currentPeriodEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      await webhookHandler.process(
        makeSubscriptionDeletedEvent(tenant.encryptedEid),
      );

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('free');
      expect(sub.stripeSubscriptionId).toBeNull();
      expect(sub.currentPeriodEnds).toBeNull();
      // stripeCustomerId is preserved (customer still exists in Stripe)
    });
  });

  // ─── Idempotency ───────────────────────────────────────────────

  describe('webhook idempotency', () => {
    it('skips duplicate event without error', async () => {
      const tenant = await createTestTenant('idempotent');
      const eventId = nextEventId();

      stripeMock.subscriptions.retrieve.mockResolvedValue({
        id: STRIPE_SUBSCRIPTION_ID,
        customer: STRIPE_CUSTOMER_ID,
        status: 'active',
        metadata: { eid: tenant.encryptedEid },
        items: {
          data: [
            {
              price: { product: STRIPE_PRODUCT_ID },
              quantity: 1,
              current_period_end: PERIOD_END_EPOCH,
            },
          ],
        },
      });

      // First processing — should succeed
      await webhookHandler.process(
        makeCheckoutEvent(tenant.encryptedEid, eventId),
      );

      const subAfterFirst = await getSubscription(tenant.id);
      if (!subAfterFirst) {
        throw new Error('Expected subscription to exist');
      }
      expect(subAfterFirst.tier).toBe('pro');

      // Second processing of same event ID — should be silently skipped
      await webhookHandler.process(
        makeCheckoutEvent(tenant.encryptedEid, eventId),
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
});
