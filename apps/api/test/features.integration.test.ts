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
import { deleteTestTenantSubscription } from './helpers/set-test-tenant-tier';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- `key` is a trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

describe('FeaturesController (integration)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;

  const createdTenantIds: string[] = [];

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

    // Test-only route to seed session keys used by SessionGuard + RLS hook.
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
  });

  afterAll(async () => {
    // Clean up test data
    for (const tenantId of createdTenantIds) {
      try {
        const reserved = await sqlClient.reserve();
        try {
          await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
          await reserved`
            DELETE FROM tenant_feature_overrides WHERE tenant_id = ${tenantId}::uuid
          `;
        } finally {
          try {
            await reserved`RESET app.tenant_id`;
          } catch {
            // ignore
          }
          reserved.release();
        }

        await deleteTestTenantSubscription(sqlClient, tenantId);
        await sqlClient`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
      } catch {
        // Best-effort cleanup
      }
    }

    await app.close();
  });

  it('returns 404 when tenant is not found', async () => {
    const testAgent = superagent(app.getHttpServer());

    await testAgent
      .get('/__test/session/set')
      .query({
        userId: 'user-1',
        tenantId: '00000000-0000-0000-0000-000000000000',
        mid: 'mid-1',
      })
      .expect(200);

    const res = await testAgent.get('/features').expect(404);
    expect(res.body.type).toBe('urn:qpp:error:resource-not-found');
  });

  it('returns merged tier features with multiple overrides applied', async () => {
    const eid = `features-int-eid-${Date.now()}`;
    const tssd = 'features-int-tssd';

    const tenantRows =
      await sqlClient`INSERT INTO tenants (eid, tssd) VALUES (${eid}, ${tssd}) RETURNING id`;
    const tenantRow = tenantRows[0];
    if (!tenantRow) {
      throw new Error('Failed to insert test tenant');
    }
    const tenantId = tenantRow.id;
    createdTenantIds.push(tenantId);

    // Insert two overrides under tenant RLS context.
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`
        INSERT INTO tenant_feature_overrides (tenant_id, feature_key, enabled)
        VALUES
          (${tenantId}::uuid, ${'quickFixes'}, ${true}),
          (${tenantId}::uuid, ${'minimap'}, ${true})
      `;
    } finally {
      try {
        await reserved`RESET app.tenant_id`;
      } catch {
        // ignore
      }
      reserved.release();
    }

    const testAgent: Agent = superagent(app.getHttpServer());
    await testAgent
      .get('/__test/session/set')
      .query({ userId: 'user-1', tenantId, mid: 'mid-1' })
      .expect(200);

    const res = await testAgent.get('/features').expect(200);

    // Check tier
    expect(res.body.tier).toBe('free');

    // Free tier defaults
    expect(res.body.features.basicLinting).toBe(true);
    expect(res.body.features.syntaxHighlighting).toBe(true);

    // Overrides applied
    expect(res.body.features.quickFixes).toBe(true);
    expect(res.body.features.minimap).toBe(true);

    // Other pro features remain disabled unless overridden
    expect(res.body.features.advancedAutocomplete).toBe(false);
  });

  it('returns free features when a Stripe subscription has expired unpaid access', async () => {
    const eid = `features-expired-sub-eid-${Date.now()}`;
    const tssd = 'features-expired-sub-tssd';

    const tenantRows =
      await sqlClient`INSERT INTO tenants (eid, tssd) VALUES (${eid}, ${tssd}) RETURNING id`;
    const tenantRow = tenantRows[0];
    if (!tenantRow) {
      throw new Error('Failed to insert test tenant');
    }
    const tenantId = tenantRow.id;
    createdTenantIds.push(tenantId);

    // Expired billing period without a fresh paid invoice should not retain access.
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
          'pro',
          'cus_test_expired',
          'sub_test_expired',
          'past_due',
          ${new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()},
          ${new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString()}
        )
      `;
    });

    const testAgent: Agent = superagent(app.getHttpServer());
    await testAgent
      .get('/__test/session/set')
      .query({ userId: 'user-1', tenantId, mid: 'mid-1' })
      .expect(200);

    const res = await testAgent.get('/features').expect(200);

    expect(res.body.tier).toBe('free');
    expect(res.body.features.advancedAutocomplete).toBe(false);
    expect(res.body.features.createDataExtension).toBe(false);
    expect(res.body.features.deployToAutomation).toBe(false);
    expect(res.body.features.executionHistory).toBe(false);
  });
});
