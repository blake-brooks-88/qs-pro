import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import type { Sql } from 'postgres';
import { type Agent, agent as superagent } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { TrialService } from '../src/trial/trial.service';
import { deleteTestTenantSubscription } from './helpers/set-test-tenant-tier';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- `key` is a trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

describe('Trial Lifecycle (integration)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;
  let trialService: TrialService;

  const createdTenantIds: string[] = [];

  async function createTestTenant(eidSuffix: string): Promise<{
    id: string;
    eid: string;
  }> {
    const eid = `trial-int-${eidSuffix}-${Date.now()}`;
    const rows =
      await sqlClient`INSERT INTO tenants (eid, tssd) VALUES (${eid}, 'test-tssd') RETURNING id`;
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to insert test tenant');
    }
    createdTenantIds.push(row.id);
    return { id: row.id, eid };
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
               current_period_ends AS "currentPeriodEnds"
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
      trialEndsAt: Date | null;
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
          ${tenantId}::uuid,
          ${data.tier},
          ${trialEndsAt},
          ${stripeSubId},
          ${stripeCusId},
          ${currentPeriodEnds}
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

  function seedSession(
    testAgent: Agent,
    opts: { tenantId: string; userId?: string; mid?: string },
  ) {
    return testAgent
      .get('/__test/session/set')
      .query({
        userId: opts.userId ?? 'user-1',
        tenantId: opts.tenantId,
        mid: opts.mid ?? 'mid-1',
      })
      .expect(200);
  }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await configureApp(app, {
      globalPrefix: false,
      session: {
        secret: getRequiredEnv('SESSION_SECRET'),
        salt: getRequiredEnv('SESSION_SALT'),
        cookie: {
          secure: false,
          sameSite: 'lax',
        },
      },
      rls: true,
    });

    // Test-only route to seed session
    const fastify = app.getHttpAdapter().getInstance();
    type SecureSession = {
      set(key: string, value: unknown): void;
    };
    type RequestWithSession = { session?: SecureSession; query?: unknown };

    fastify.get('/__test/session/set', (req: unknown, reply: unknown) => {
      const request = req as RequestWithSession;
      const response = reply as { send: (body: unknown) => void };
      const query = (request.query ?? {}) as Record<string, unknown>;

      request.session?.set('userId', query.userId);
      request.session?.set('tenantId', query.tenantId);
      request.session?.set('mid', query.mid);
      request.session?.set('csrfToken', 'csrf-test');

      response.send({ ok: true });
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    sqlClient = app.get<Sql>('SQL_CLIENT');
    trialService = app.get<TrialService>(TrialService);
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
  });

  // ─── TrialService.activateTrial ──────────────────────────────────

  describe('TrialService.activateTrial', () => {
    it('creates pro subscription with ~14-day trial for new tenant', async () => {
      const tenant = await createTestTenant('new');

      await trialService.activateTrial(tenant.id, {
        actorId: 'user-1',
        mid: 'mid-1',
      });

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');

      const trialEndsAt = new Date(sub.trialEndsAt as string);
      const daysUntilExpiry =
        (trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysUntilExpiry).toBeGreaterThan(13);
      expect(daysUntilExpiry).toBeLessThanOrEqual(15);

      expect(sub.stripeCustomerId).toBeNull();
      expect(sub.stripeSubscriptionId).toBeNull();
    });

    it('is idempotent — second call does not create duplicate', async () => {
      const tenant = await createTestTenant('idempotent');

      await trialService.activateTrial(tenant.id, {
        actorId: 'user-1',
        mid: 'mid-1',
      });
      await trialService.activateTrial(tenant.id, {
        actorId: 'user-1',
        mid: 'mid-1',
      });

      const count = await countSubscriptions(tenant.id);
      expect(count).toBe(1);
    });

    it('starts trial for existing free tenant without prior trial', async () => {
      const tenant = await createTestTenant('free-no-trial');

      // Pre-insert as free with no trial
      await setSubscriptionState(tenant.id, {
        tier: 'free',
        trialEndsAt: null,
      });

      await trialService.activateTrial(tenant.id, {
        actorId: 'user-1',
        mid: 'mid-1',
      });

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.trialEndsAt).not.toBeNull();
    });

    it('does not restart trial for tenant that was already trialed', async () => {
      const tenant = await createTestTenant('already-trialed');
      const pastTrialEnd = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Pre-insert as free with expired trial (already trialed)
      await setSubscriptionState(tenant.id, {
        tier: 'free',
        trialEndsAt: pastTrialEnd,
      });

      await trialService.activateTrial(tenant.id, {
        actorId: 'user-1',
        mid: 'mid-1',
      });

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      // Tier unchanged — trial was already used
      expect(sub.tier).toBe('free');
      // trialEndsAt unchanged — still in the past (not refreshed to a future date)
      const storedTrialEnd = new Date(sub.trialEndsAt as string);
      expect(storedTrialEnd.getTime()).toBeLessThan(Date.now());
    });

    it('does not restart trial for paid subscriber', async () => {
      const tenant = await createTestTenant('paid-sub');

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        trialEndsAt: null,
        stripeSubscriptionId: 'sub_existing_123',
        stripeCustomerId: 'cus_existing_123',
      });

      await trialService.activateTrial(tenant.id, {
        actorId: 'user-1',
        mid: 'mid-1',
      });

      const sub = await getSubscription(tenant.id);
      if (!sub) {
        throw new Error('Expected subscription to exist');
      }
      expect(sub.tier).toBe('pro');
      expect(sub.stripeSubscriptionId).toBe('sub_existing_123');
      expect(sub.trialEndsAt).toBeNull();
    });
  });

  // ─── GET /features — trial tier resolution ───────────────────────

  describe('GET /features — trial tier resolution', () => {
    it('returns pro tier with active trial state', async () => {
      const tenant = await createTestTenant('active-trial');
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        trialEndsAt: futureDate,
      });

      const testAgent = superagent(app.getHttpServer());
      await seedSession(testAgent, { tenantId: tenant.id });

      const res = await testAgent.get('/features').expect(200);

      expect(res.body.tier).toBe('pro');
      expect(res.body.trial).toBeDefined();
      expect(res.body.trial.active).toBe(true);
      expect(res.body.trial.daysRemaining).toBeGreaterThanOrEqual(4);
      expect(res.body.trial.daysRemaining).toBeLessThanOrEqual(5);
    });

    it('returns free tier when trial expired and no Stripe subscription', async () => {
      const tenant = await createTestTenant('expired-trial');
      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        trialEndsAt: pastDate,
      });

      const testAgent = superagent(app.getHttpServer());
      await seedSession(testAgent, { tenantId: tenant.id });

      const res = await testAgent.get('/features').expect(200);

      expect(res.body.tier).toBe('free');
      expect(res.body.trial).toBeDefined();
      expect(res.body.trial.active).toBe(false);
      expect(res.body.trial.daysRemaining).toBe(0);
    });

    it('returns subscription tier when Stripe subscription exists', async () => {
      const tenant = await createTestTenant('stripe-sub');
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        trialEndsAt: pastDate,
        stripeSubscriptionId: 'sub_real_123',
        stripeCustomerId: 'cus_real_123',
      });

      const testAgent = superagent(app.getHttpServer());
      await seedSession(testAgent, { tenantId: tenant.id });

      const res = await testAgent.get('/features').expect(200);

      // Stripe subscription overrides expired trial
      expect(res.body.tier).toBe('pro');
    });

    it('returns correct pro feature flags during active trial', async () => {
      const tenant = await createTestTenant('pro-flags');
      const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        trialEndsAt: futureDate,
      });

      const testAgent = superagent(app.getHttpServer());
      await seedSession(testAgent, { tenantId: tenant.id });

      const res = await testAgent.get('/features').expect(200);

      expect(res.body.tier).toBe('pro');
      expect(res.body.features).toEqual({
        basicLinting: true,
        syntaxHighlighting: true,
        systemDataViews: true,
        quickFixes: true,
        minimap: true,
        advancedAutocomplete: true,
        querySharing: true,
        createDataExtension: true,
        teamSnippets: false,
        teamCollaboration: false,
        auditLogs: false,
        deployToAutomation: true,
        runToTargetDE: true,
        executionHistory: true,
        versionHistory: true,
      });
    });

    it('returns correct free feature flags when trial expired', async () => {
      const tenant = await createTestTenant('free-flags');
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

      await setSubscriptionState(tenant.id, {
        tier: 'pro',
        trialEndsAt: pastDate,
      });

      const testAgent = superagent(app.getHttpServer());
      await seedSession(testAgent, { tenantId: tenant.id });

      const res = await testAgent.get('/features').expect(200);

      expect(res.body.tier).toBe('free');
      expect(res.body.features).toEqual({
        basicLinting: true,
        syntaxHighlighting: true,
        systemDataViews: true,
        quickFixes: false,
        minimap: false,
        advancedAutocomplete: false,
        querySharing: false,
        createDataExtension: false,
        teamSnippets: false,
        teamCollaboration: false,
        auditLogs: false,
        deployToAutomation: false,
        runToTargetDE: false,
        executionHistory: false,
        versionHistory: false,
      });
    });

    it('returns correct enterprise feature flags', async () => {
      const tenant = await createTestTenant('enterprise-flags');

      await setSubscriptionState(tenant.id, {
        tier: 'enterprise',
        trialEndsAt: null,
        stripeSubscriptionId: 'sub_enterprise_123',
        stripeCustomerId: 'cus_enterprise_123',
      });

      const testAgent = superagent(app.getHttpServer());
      await seedSession(testAgent, { tenantId: tenant.id });

      const res = await testAgent.get('/features').expect(200);

      expect(res.body.tier).toBe('enterprise');
      expect(res.body.features).toEqual({
        basicLinting: true,
        syntaxHighlighting: true,
        systemDataViews: true,
        quickFixes: true,
        minimap: true,
        advancedAutocomplete: true,
        querySharing: true,
        createDataExtension: true,
        teamSnippets: true,
        teamCollaboration: true,
        auditLogs: true,
        deployToAutomation: true,
        runToTargetDE: true,
        executionHistory: true,
        versionHistory: true,
      });
    });

    it('defaults to free tier when no subscription row exists', async () => {
      const tenant = await createTestTenant('no-sub');
      // Don't create any org_subscriptions row

      const testAgent = superagent(app.getHttpServer());
      await seedSession(testAgent, { tenantId: tenant.id });

      const res = await testAgent.get('/features').expect(200);

      expect(res.body.tier).toBe('free');
      expect(res.body.trial).toBeNull();
      expect(res.body.features.basicLinting).toBe(true);
      expect(res.body.features.advancedAutocomplete).toBe(false);
    });
  });
});
