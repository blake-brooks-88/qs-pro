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
          await reserved`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
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
      await sqlClient`INSERT INTO tenants (eid, tssd, subscription_tier) VALUES (${eid}, ${tssd}, ${'free'}) RETURNING id`;
    const tenantRow = tenantRows[0];
    if (!tenantRow) {
      throw new Error('Failed to insert test tenant');
    }
    const tenantId = tenantRow.id;
    createdTenantIds.push(tenantId);

    // Insert two overrides under tenant RLS context.
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
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

    // Free tier defaults
    expect(res.body.basicLinting).toBe(true);
    expect(res.body.syntaxHighlighting).toBe(true);

    // Overrides applied
    expect(res.body.quickFixes).toBe(true);
    expect(res.body.minimap).toBe(true);

    // Other pro features remain disabled unless overridden
    expect(res.body.advancedAutocomplete).toBe(false);
  });
});
