import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService, RlsContextService } from '@qpp/backend-shared';
import type { Sql } from 'postgres';
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
import { BillingService } from '../src/billing/billing.service';
import { STRIPE_CLIENT } from '../src/billing/stripe.provider';
import { StripeCatalogService } from '../src/billing/stripe-catalog.service';
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

// ─── Stripe SDK Mock (external boundary) ───────────────────────────
// Only the Stripe SDK is mocked. Everything else is real.

function makePrice(
  lookupKey:
    | 'pro_monthly'
    | 'pro_annual'
    | 'enterprise_monthly'
    | 'enterprise_annual',
  product = 'prod_test_default',
) {
  const interval = lookupKey.endsWith('_annual') ? 'year' : 'month';
  return {
    id: `price_${lookupKey}_test`,
    lookup_key: lookupKey,
    product,
    recurring: { interval },
  };
}

function createStripeMock() {
  let checkoutCounter = 0;

  return {
    webhooks: {
      constructEvent: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockImplementation(async () => {
          checkoutCounter += 1;
          return {
            id: `cs_test_checkout_session_${checkoutCounter}`,
            url: 'https://checkout.stripe.com/test-session',
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
          };
        }),
        retrieve: vi.fn(),
      },
    },
    prices: {
      list: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'price_pro_monthly_test',
            lookup_key: 'pro_monthly',
            unit_amount: 2900,
            recurring: { interval: 'month' },
          },
          {
            id: 'price_pro_annual_test',
            lookup_key: 'pro_annual',
            unit_amount: 27900,
            recurring: { interval: 'year' },
          },
          {
            id: 'price_enterprise_monthly_test',
            lookup_key: 'enterprise_monthly',
            unit_amount: 9900,
            recurring: { interval: 'month' },
          },
          {
            id: 'price_enterprise_annual_test',
            lookup_key: 'enterprise_annual',
            unit_amount: 99900,
            recurring: { interval: 'year' },
          },
        ],
      }),
    },
    products: {
      retrieve: vi.fn(),
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
    charges: {
      retrieve: vi.fn(),
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          url: 'https://billing.stripe.com/test-portal',
        }),
      },
    },
  };
}

describe('BillingService (integration)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;
  let billingService: BillingService;
  let featuresService: FeaturesService;
  let encryptionService: EncryptionService;
  let rlsContext: RlsContextService;
  let stripeCatalogService: StripeCatalogService;
  let stripeMock: ReturnType<typeof createStripeMock>;

  const createdTenantIds: string[] = [];

  async function createTestTenant(suffix: string): Promise<{
    id: string;
    eid: string;
  }> {
    const eid = `test---billing-service-${suffix}-${Date.now()}`;
    const rows = await sqlClient`
      INSERT INTO tenants (eid, tssd) VALUES (${eid}, 'test---tssd') RETURNING id
    `;
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to insert test tenant');
    }
    createdTenantIds.push(row.id);
    return { id: row.id, eid };
  }

  async function setSubscriptionState(
    tenantId: string,
    data: {
      tier: string;
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
      stripeSubscriptionStatus?:
        | 'inactive'
        | 'trialing'
        | 'active'
        | 'past_due'
        | 'unpaid'
        | 'canceled';
      currentPeriodEnds?: Date | null;
      lastInvoicePaidAt?: Date | null;
    },
  ): Promise<void> {
    const stripeCusId = data.stripeCustomerId ?? null;
    const stripeSubId = data.stripeSubscriptionId ?? null;
    const stripeSubscriptionStatus =
      data.stripeSubscriptionStatus ?? (stripeSubId ? 'active' : 'inactive');
    const currentPeriodEnds = data.currentPeriodEnds?.toISOString() ?? null;
    const lastInvoicePaidAt =
      data.lastInvoicePaidAt?.toISOString() ??
      (stripeSubId ? new Date().toISOString() : null);

    await sqlClient.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx`
        INSERT INTO org_subscriptions (
          tenant_id,
          tier,
          stripe_customer_id,
          stripe_subscription_id,
          stripe_subscription_status,
          current_period_ends,
          last_invoice_paid_at
        )
        VALUES (
          ${tenantId}::uuid,
          ${data.tier},
          ${stripeCusId},
          ${stripeSubId},
          ${stripeSubscriptionStatus},
          ${currentPeriodEnds},
          ${lastInvoicePaidAt}
        )
        ON CONFLICT (tenant_id) DO UPDATE SET
          tier = ${data.tier},
          stripe_customer_id = ${stripeCusId},
          stripe_subscription_id = ${stripeSubId},
          stripe_subscription_status = ${stripeSubscriptionStatus},
          current_period_ends = ${currentPeriodEnds},
          last_invoice_paid_at = ${lastInvoicePaidAt}
      `;
    });
  }

  async function getSubscription(
    tenantId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      const [row] = await reserved`
        SELECT tier,
               stripe_customer_id AS "stripeCustomerId",
               stripe_subscription_id AS "stripeSubscriptionId",
               stripe_subscription_status AS "stripeSubscriptionStatus",
               current_period_ends AS "currentPeriodEnds",
               last_invoice_paid_at AS "lastInvoicePaidAt"
        FROM org_subscriptions
        WHERE tenant_id = ${tenantId}::uuid
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

  /**
   * Clears the internal Stripe price caches so tests that change
   * `prices.list` mock behaviour see the new values.
   */
  function clearPriceCache(): void {
    const svc = billingService as unknown as {
      pricesResponseCache: unknown;
    };
    svc.pricesResponseCache = null;

    const catalog = stripeCatalogService as unknown as {
      catalogCache: unknown;
    };
    catalog.catalogCache = null;
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
    billingService = app.get(BillingService);
    stripeCatalogService = app.get(StripeCatalogService);
    featuresService = app.get(FeaturesService);
    encryptionService = app.get(EncryptionService);
    rlsContext = app.get(RlsContextService);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearPriceCache();

    // Reset default Stripe mock return values
    let checkoutCounter = 0;
    stripeMock.checkout.sessions.create.mockImplementation(async () => {
      checkoutCounter += 1;
      return {
        id: `cs_test_checkout_session_${Date.now()}_${checkoutCounter}`,
        url: 'https://checkout.stripe.com/test-session',
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      };
    });
    stripeMock.checkout.sessions.retrieve.mockReset();
    stripeMock.prices.list.mockResolvedValue({
      data: [
        {
          id: 'price_pro_monthly_test',
          lookup_key: 'pro_monthly',
          unit_amount: 2900,
          recurring: { interval: 'month' },
        },
        {
          id: 'price_pro_annual_test',
          lookup_key: 'pro_annual',
          unit_amount: 27900,
          recurring: { interval: 'year' },
        },
        {
          id: 'price_enterprise_monthly_test',
          lookup_key: 'enterprise_monthly',
          unit_amount: 9900,
          recurring: { interval: 'month' },
        },
        {
          id: 'price_enterprise_annual_test',
          lookup_key: 'enterprise_annual',
          unit_amount: 99900,
          recurring: { interval: 'year' },
        },
      ],
    });
    stripeMock.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.com/test-portal',
    });
  });

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      try {
        await deleteTestTenantSubscription(sqlClient, tenantId);
        await sqlClient`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
      } catch {
        // Best-effort cleanup
      }
    }
    await app.close();
    await sqlClient.end({ timeout: 5 });
  });

  // ─── createCheckoutSession ──────────────────────────────────────

  describe('createCheckoutSession', () => {
    it('returns a checkout URL for a valid tenant with monthly interval', async () => {
      const tenant = await createTestTenant('checkout-monthly');

      const result = await billingService.createCheckoutSession(
        tenant.id,
        'pro',
        'monthly',
      );

      expect(result.url).toBe('https://checkout.stripe.com/test-session');
    });

    it('loads the Stripe catalog by lookup key before creating checkout', async () => {
      const tenant = await createTestTenant('checkout-lookup');

      await billingService.createCheckoutSession(tenant.id, 'pro', 'monthly');

      expect(stripeMock.prices.list).toHaveBeenCalledWith({
        lookup_keys: [
          'pro_monthly',
          'pro_annual',
          'enterprise_monthly',
          'enterprise_annual',
        ],
        active: true,
        limit: 100,
      });
    });

    it('calls Stripe checkout.sessions.create with subscription mode and metadata', async () => {
      const tenant = await createTestTenant('checkout-metadata');

      await billingService.createCheckoutSession(tenant.id, 'pro', 'monthly');

      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          metadata: expect.objectContaining({ tier: 'pro' }),
          success_url: expect.stringContaining(
            'session_id={CHECKOUT_SESSION_ID}',
          ),
          allow_promotion_codes: true,
          custom_fields: expect.arrayContaining([
            expect.objectContaining({ key: 'purchase_order' }),
          ]),
        }),
        expect.objectContaining({
          idempotencyKey: expect.stringContaining(`checkout:${tenant.id}:`),
        }),
      );
    });

    it('uses the mapped annual price id for annual checkout', async () => {
      const tenant = await createTestTenant('checkout-annual');

      await billingService.createCheckoutSession(tenant.id, 'pro', 'annual');

      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: 'price_pro_annual_test', quantity: 1 }],
        }),
        expect.any(Object),
      );
    });

    it('uses the mapped enterprise price id for enterprise tier', async () => {
      const tenant = await createTestTenant('checkout-enterprise');

      await billingService.createCheckoutSession(
        tenant.id,
        'enterprise',
        'monthly',
      );

      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: 'price_enterprise_monthly_test', quantity: 1 }],
        }),
        expect.any(Object),
      );
    });

    it('throws BadRequestException when tenant not found', async () => {
      await expect(
        billingService.createCheckoutSession(
          '00000000-0000-0000-0000-000000000000',
          'pro',
          'monthly',
        ),
      ).rejects.toThrow('Tenant not found');
    });

    it('throws BadRequestException when price not configured', async () => {
      const tenant = await createTestTenant('checkout-no-price');
      stripeMock.prices.list.mockResolvedValue({ data: [] });

      await expect(
        billingService.createCheckoutSession(tenant.id, 'pro', 'monthly'),
      ).rejects.toThrow('Price not configured');
    });

    it('rejects checkout when tenant already has an active Stripe subscription', async () => {
      const tenant = await createTestTenant('checkout-already-paid');
      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: 'cus_existing_paid',
        stripeSubscriptionId: 'sub_existing_paid',
        currentPeriodEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastInvoicePaidAt: new Date(),
      });

      await expect(
        billingService.createCheckoutSession(tenant.id, 'pro', 'monthly'),
      ).rejects.toThrow(
        'An active paid subscription already exists for this tenant',
      );

      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('reconciles a completed paid checkout before deciding whether to reuse it', async () => {
      const tenant = await createTestTenant('checkout-reconcile-stale');
      const encryptedEid = encryptionService.encrypt(tenant.eid) as string;
      const sessionId = `cs_test_stale_paid_${Date.now()}`;

      stripeMock.checkout.sessions.create.mockResolvedValueOnce({
        id: sessionId,
        url: 'https://checkout.stripe.com/stale-session',
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      });

      await billingService.createCheckoutSession(tenant.id, 'pro', 'monthly');

      stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: sessionId,
        status: 'complete',
        payment_status: 'paid',
        customer: 'cus_reconciled_paid',
        subscription: 'sub_reconciled_paid',
        metadata: { eid: encryptedEid },
      });
      stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
        id: 'sub_reconciled_paid',
        customer: 'cus_reconciled_paid',
        status: 'active',
        metadata: { eid: encryptedEid },
        items: {
          data: [
            {
              price: makePrice('pro_monthly', 'prod_reconciled_paid'),
              quantity: 1,
              current_period_end:
                Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            },
          ],
        },
      });
      await expect(
        billingService.createCheckoutSession(tenant.id, 'pro', 'monthly'),
      ).rejects.toThrow(
        'An active paid subscription already exists for this tenant',
      );

      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
      expect(stripeMock.checkout.sessions.retrieve).toHaveBeenCalledWith(
        sessionId,
      );

      const subscription = await getSubscription(tenant.id);
      expect(subscription?.tier).toBe('pro');
      expect(subscription?.stripeCustomerId).toBe('cus_reconciled_paid');
      expect(subscription?.stripeSubscriptionId).toBe('sub_reconciled_paid');
      expect(subscription?.lastInvoicePaidAt).not.toBeNull();

      const features = await featuresService.getTenantFeatures(tenant.id);
      expect(features.tier).toBe('pro');
    });

    it('reconciles a completed paid checkout even when the retry requests a different interval', async () => {
      const tenant = await createTestTenant('checkout-reconcile-mismatch');
      const encryptedEid = encryptionService.encrypt(tenant.eid) as string;
      const sessionId = `cs_test_stale_mismatch_${Date.now()}`;

      stripeMock.checkout.sessions.create.mockResolvedValueOnce({
        id: sessionId,
        url: 'https://checkout.stripe.com/stale-mismatch-session',
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      });

      await billingService.createCheckoutSession(tenant.id, 'pro', 'monthly');

      stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: sessionId,
        status: 'complete',
        payment_status: 'paid',
        customer: 'cus_reconciled_mismatch',
        subscription: 'sub_reconciled_mismatch',
        metadata: { eid: encryptedEid },
      });
      stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
        id: 'sub_reconciled_mismatch',
        customer: 'cus_reconciled_mismatch',
        status: 'active',
        metadata: { eid: encryptedEid },
        items: {
          data: [
            {
              price: makePrice('pro_monthly', 'prod_reconciled_mismatch'),
              quantity: 1,
              current_period_end:
                Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            },
          ],
        },
      });
      await expect(
        billingService.createCheckoutSession(tenant.id, 'pro', 'annual'),
      ).rejects.toThrow(
        'An active paid subscription already exists for this tenant',
      );

      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
      expect(stripeMock.checkout.sessions.retrieve).toHaveBeenCalledWith(
        sessionId,
      );

      const subscription = await getSubscription(tenant.id);
      expect(subscription?.tier).toBe('pro');
      expect(subscription?.stripeCustomerId).toBe('cus_reconciled_mismatch');
      expect(subscription?.stripeSubscriptionId).toBe(
        'sub_reconciled_mismatch',
      );
      expect(subscription?.lastInvoicePaidAt).not.toBeNull();
    });

    it('creates a fresh checkout when the previous completed session did not produce a paid entitlement', async () => {
      const tenant = await createTestTenant('checkout-recreate-terminal');
      const encryptedEid = encryptionService.encrypt(tenant.eid) as string;

      stripeMock.checkout.sessions.create
        .mockResolvedValueOnce({
          id: 'cs_test_terminal_old',
          url: 'https://checkout.stripe.com/terminal-old',
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        })
        .mockResolvedValueOnce({
          id: 'cs_test_terminal_new',
          url: 'https://checkout.stripe.com/terminal-new',
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        });

      await billingService.createCheckoutSession(tenant.id, 'pro', 'monthly');

      stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: 'cs_test_terminal_old',
        status: 'complete',
        payment_status: 'unpaid',
        metadata: { eid: encryptedEid },
      });

      const result = await billingService.createCheckoutSession(
        tenant.id,
        'pro',
        'monthly',
      );

      expect(result.url).toBe('https://checkout.stripe.com/terminal-new');
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(2);
      expect(stripeMock.checkout.sessions.retrieve).toHaveBeenCalledWith(
        'cs_test_terminal_old',
      );
      expect(await getSubscription(tenant.id)).toBeUndefined();
    });
  });

  // ─── confirmCheckoutSession ────────────────────────────────────

  describe('confirmCheckoutSession', () => {
    it('reconciles a paid checkout session into effective pro access', async () => {
      const tenant = await createTestTenant('confirm-paid');
      const encryptedEid = encryptionService.encrypt(tenant.eid) as string;
      const sessionId = `cs_test_confirm_paid_${Date.now()}`;

      stripeMock.checkout.sessions.retrieve.mockResolvedValue({
        id: sessionId,
        status: 'complete',
        customer: 'cus_confirm_paid',
        subscription: 'sub_confirm_paid',
        metadata: { eid: encryptedEid },
        payment_status: 'paid',
      });
      stripeMock.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_confirm_paid',
        customer: 'cus_confirm_paid',
        status: 'active',
        metadata: { eid: encryptedEid },
        items: {
          data: [
            {
              price: makePrice('pro_monthly', 'prod_confirm_paid'),
              quantity: 1,
              current_period_end:
                Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            },
          ],
        },
      });
      const result = await billingService.confirmCheckoutSession(
        tenant.id,
        sessionId,
      );

      expect(result.status).toBe('fulfilled');

      const subscription = await getSubscription(tenant.id);
      expect(subscription?.tier).toBe('pro');
      expect(subscription?.stripeCustomerId).toBe('cus_confirm_paid');
      expect(subscription?.stripeSubscriptionId).toBe('sub_confirm_paid');
      expect(subscription?.lastInvoicePaidAt).not.toBeNull();

      const features = await featuresService.getTenantFeatures(tenant.id);
      expect(features.tier).toBe('pro');
      expect(features.features.advancedAutocomplete).toBe(true);
    });

    it('returns pending when checkout session is not yet paid', async () => {
      const tenant = await createTestTenant('confirm-pending');
      const encryptedEid = encryptionService.encrypt(tenant.eid) as string;

      stripeMock.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_test_confirm_pending',
        status: 'open',
        customer: 'cus_confirm_pending',
        subscription: 'sub_confirm_pending',
        metadata: { eid: encryptedEid },
        payment_status: 'unpaid',
      });

      const result = await billingService.confirmCheckoutSession(
        tenant.id,
        'cs_test_confirm_pending',
      );

      expect(result.status).toBe('pending');
      expect(await getSubscription(tenant.id)).toBeUndefined();
    });

    it('returns failed when checkout completed without payment', async () => {
      const tenant = await createTestTenant('confirm-failed');
      const encryptedEid = encryptionService.encrypt(tenant.eid) as string;

      stripeMock.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_test_confirm_failed',
        status: 'complete',
        customer: 'cus_confirm_failed',
        subscription: 'sub_confirm_failed',
        metadata: { eid: encryptedEid },
        payment_status: 'unpaid',
      });

      const result = await billingService.confirmCheckoutSession(
        tenant.id,
        'cs_test_confirm_failed',
      );

      expect(result).toEqual({
        status: 'failed',
        reason: 'unpaid',
      });
      expect(await getSubscription(tenant.id)).toBeUndefined();
    });
  });

  // ─── createPortalSession ────────────────────────────────────────

  describe('createPortalSession', () => {
    it('returns a portal URL when subscription has stripeCustomerId', async () => {
      const tenant = await createTestTenant('portal-success');
      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: 'cus_portal_test',
        stripeSubscriptionId: 'sub_portal_test',
      });

      const result = await rlsContext.runWithTenantContext(
        tenant.id,
        'system',
        () => billingService.createPortalSession(tenant.id),
      );

      expect(result.url).toBe('https://billing.stripe.com/test-portal');
    });

    it('calls Stripe billingPortal.sessions.create with correct customer', async () => {
      const tenant = await createTestTenant('portal-customer');
      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: 'cus_portal_verify',
        stripeSubscriptionId: 'sub_portal_verify',
      });

      await rlsContext.runWithTenantContext(tenant.id, 'system', () =>
        billingService.createPortalSession(tenant.id),
      );

      expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_portal_verify',
        }),
      );
    });

    it('throws BadRequestException when no subscription exists', async () => {
      const tenant = await createTestTenant('portal-no-sub');

      await expect(
        rlsContext.runWithTenantContext(tenant.id, 'system', () =>
          billingService.createPortalSession(tenant.id),
        ),
      ).rejects.toThrow('No active subscription found');
    });

    it('throws BadRequestException when subscription has no stripeCustomerId', async () => {
      const tenant = await createTestTenant('portal-no-cus');
      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        stripeCustomerId: null,
      });

      await expect(
        rlsContext.runWithTenantContext(tenant.id, 'system', () =>
          billingService.createPortalSession(tenant.id),
        ),
      ).rejects.toThrow('No active subscription found');
    });
  });

  // ─── getPrices ──────────────────────────────────────────────────

  describe('getPrices', () => {
    it('returns correct price structure from Stripe', async () => {
      const result = await billingService.getPrices();

      expect(result.pro).toBeDefined();
      expect(typeof result.pro.monthly).toBe('number');
      expect(typeof result.pro.annual).toBe('number');
      expect(result.pro.monthly).toBe(29);
    });

    it('normalizes annual price to monthly equivalent', async () => {
      const result = await billingService.getPrices();

      // 27900 cents / 100 = 279, / 12 months = 23.25
      expect(result.pro.annual).toBe(23.25);
    });

    it('caches results - second call does not hit Stripe again', async () => {
      // First call populates the cache
      await billingService.getPrices();
      const callCountAfterFirst = stripeMock.prices.list.mock.calls.length;

      // Second call should use cache
      await billingService.getPrices();
      const callCountAfterSecond = stripeMock.prices.list.mock.calls.length;

      expect(callCountAfterSecond).toBe(callCountAfterFirst);
    });
  });

  // ─── Stripe null (ServiceUnavailable) ───────────────────────────

  describe('Stripe not configured', () => {
    let serviceNoStripe: BillingService;

    beforeAll(() => {
      serviceNoStripe = Object.create(
        Object.getPrototypeOf(billingService),
      ) as BillingService;
      Object.assign(serviceNoStripe, billingService);
      Object.defineProperty(serviceNoStripe, 'stripe', {
        value: null,
        writable: false,
      });
    });

    it('createCheckoutSession throws ServiceUnavailableException', async () => {
      await expect(
        serviceNoStripe.createCheckoutSession('tenant-1', 'pro', 'monthly'),
      ).rejects.toThrow('Stripe is not configured');
    });

    it('createPortalSession throws ServiceUnavailableException', async () => {
      await expect(
        serviceNoStripe.createPortalSession('tenant-1'),
      ).rejects.toThrow('Stripe is not configured');
    });

    it('getPrices throws ServiceUnavailableException', async () => {
      await expect(serviceNoStripe.getPrices()).rejects.toThrow(
        'Stripe is not configured',
      );
    });
  });
});
