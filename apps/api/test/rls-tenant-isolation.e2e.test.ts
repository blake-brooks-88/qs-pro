import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { ITenantRepository, IUserRepository } from '@qpp/database';
import { externalOnlyOnUnhandledRequest } from '@qpp/test-utils';
import * as jose from 'jose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Sql } from 'postgres';
import { agent as superagent } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- `key` is a trusted string, not user input
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const server = setupServer(
  http.post('https://test-tssd.auth.marketingcloudapis.com/v2/token', () => {
    return HttpResponse.json({
      access_token: 'rls-test-access-token',
      refresh_token: 'rls-test-refresh-token',
      expires_in: 3600,
      rest_instance_url: 'https://test-rest.com',
      soap_instance_url: 'https://test-soap.com',
      scope: 'read write',
      token_type: 'Bearer',
    });
  }),
  http.get('https://test-tssd.auth.marketingcloudapis.com/v2/userinfo', () => {
    return HttpResponse.json({
      sub: 'rls-test-user',
      enterprise_id: 'rls-test-eid',
      member_id: 'rls-test-mid',
      email: 'rls-test@example.com',
      name: 'RLS Test User',
    });
  }),
);

describe('RLS Tenant Isolation (e2e)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;

  // Track created tenant/user IDs for cleanup
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRuns: Array<{
    runId: string;
    tenantId: string;
    mid: string;
    userId: string;
  }> = [];
  const createdCredentials: Array<{
    credentialId: string;
    tenantId: string;
    mid: string;
  }> = [];

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: externalOnlyOnUnhandledRequest() });

    process.env.MCE_TSSD = 'test-tssd';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
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

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    sqlClient = app.get<Sql>('SQL_CLIENT');
  });

  afterAll(async () => {
    server.close();

    // Clean up test data in reverse order using exact RLS context for each record.
    // Every reserve() is wrapped in try/finally to guarantee release and prevent pool exhaustion.

    // 1. Delete shell_query_runs with exact context (tenant + mid + user required)
    for (const run of createdRuns) {
      try {
        const reserved = await sqlClient.reserve();
        try {
          await reserved`SELECT set_config('app.tenant_id', ${run.tenantId}, false), set_config('app.mid', ${run.mid}, false), set_config('app.user_id', ${run.userId}, false)`;
          await reserved`DELETE FROM shell_query_runs WHERE id = ${run.runId}::uuid`;
        } finally {
          reserved.release();
        }
      } catch {
        // Best effort cleanup
      }
    }

    // 2. Delete credentials with exact context (tenant + mid required)
    for (const cred of createdCredentials) {
      try {
        const reserved = await sqlClient.reserve();
        try {
          await reserved`SELECT set_config('app.tenant_id', ${cred.tenantId}, false), set_config('app.mid', ${cred.mid}, false)`;
          await reserved`DELETE FROM credentials WHERE id = ${cred.credentialId}::uuid`;
        } finally {
          reserved.release();
        }
      } catch {
        // Best effort
      }
    }

    // 3. Delete any remaining credentials created during auth flow.
    // Use a single reserved connection per tenant+mid to avoid pool exhaustion.
    if (createdUserIds.length > 0 && createdTenantIds.length > 0) {
      const midsToTry = [
        'mid-a',
        'mid-b',
        'mid-c',
        'mid-d',
        'mid-e',
        'mid-f',
        'mid-g',
        'mid-h',
        'mid-i',
      ];
      for (const tenantId of createdTenantIds) {
        for (const mid of midsToTry) {
          try {
            const reserved = await sqlClient.reserve();
            try {
              await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false), set_config('app.mid', ${mid}, false)`;
              await reserved`DELETE FROM credentials WHERE user_id = ANY(${createdUserIds}::uuid[])`;
            } finally {
              reserved.release();
            }
          } catch {
            // Ignore - RLS may block if wrong context
          }
        }
      }
    }

    // 4. Delete any remaining shell_query_runs.
    // Use batch delete with ANY() to collapse the inner loop into a single query per tenant+mid.
    if (createdUserIds.length > 0 && createdTenantIds.length > 0) {
      const midsToTry = [
        'mid-a',
        'mid-b',
        'mid-c',
        'mid-d',
        'mid-e',
        'mid-f',
        'mid-g',
        'mid-h',
        'mid-i',
      ];
      for (const tenantId of createdTenantIds) {
        for (const mid of midsToTry) {
          try {
            const reserved = await sqlClient.reserve();
            try {
              const firstUserId = createdUserIds[0] ?? '';
              await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false), set_config('app.mid', ${mid}, false), set_config('app.user_id', ${firstUserId}, false)`;
              await reserved`DELETE FROM shell_query_runs WHERE user_id = ANY(${createdUserIds}::uuid[])`;
            } finally {
              reserved.release();
            }
          } catch {
            // Ignore - RLS may block if wrong context
          }
        }
      }
    }

    // 5. Users and tenants are NOT RLS-protected, delete directly
    if (createdUserIds.length > 0) {
      await sqlClient`DELETE FROM users WHERE id = ANY(${createdUserIds}::uuid[])`;
    }

    if (createdTenantIds.length > 0) {
      await sqlClient`DELETE FROM tenants WHERE id = ANY(${createdTenantIds}::uuid[])`;
    }

    await app.close();
  });

  async function createTestTenant(eid: string, tssd: string): Promise<string> {
    const tenantRepo: ITenantRepository = app.get('TENANT_REPOSITORY');
    const tenant = await tenantRepo.upsert({ eid, tssd });
    createdTenantIds.push(tenant.id);
    return tenant.id;
  }

  async function createTestUser(
    sfUserId: string,
    tenantId: string,
  ): Promise<string> {
    const userRepo: IUserRepository = app.get('USER_REPOSITORY');
    const user = await userRepo.upsert({ sfUserId, tenantId });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function createAuthenticatedAgent(
    sfUserId: string,
    eid: string,
    mid: string,
  ) {
    const testAgent = superagent(app.getHttpServer());
    const secret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
    const encodedSecret = new TextEncoder().encode(secret);

    const payload = {
      user_id: sfUserId,
      enterprise_id: eid,
      member_id: mid,
      stack: 'test-tssd',
    };

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(encodedSecret);

    await testAgent.post('/auth/login').send({ jwt }).expect(302);

    // Get CSRF token
    const meResponse = await testAgent.get('/auth/me').expect(200);
    const csrfToken = meResponse.body.csrfToken;

    return { agent: testAgent, csrfToken };
  }

  async function createShellQueryRunWithContext(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<string> {
    const runId = crypto.randomUUID();
    createdRuns.push({ runId, tenantId, mid, userId });

    // Insert with RLS context set
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${mid}, false)`;
      await reserved`SELECT set_config('app.user_id', ${userId}, false)`;

      await reserved`
        INSERT INTO shell_query_runs (id, tenant_id, user_id, mid, sql_text_hash, status)
        VALUES (${runId}::uuid, ${tenantId}::uuid, ${userId}::uuid, ${mid}, ${'test-hash-' + runId}, 'queued')
      `;
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      reserved.release();
    }

    return runId;
  }

  async function createCredentialsWithContext(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<string> {
    const credentialId = crypto.randomUUID();
    createdCredentials.push({ credentialId, tenantId, mid });

    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${mid}, false)`;

      await reserved`
        INSERT INTO credentials (id, tenant_id, user_id, mid, access_token, refresh_token, expires_at)
        VALUES (
          ${credentialId}::uuid,
          ${tenantId}::uuid,
          ${userId}::uuid,
          ${mid},
          'test-access-token',
          'test-refresh-token',
          ${expiresAt}::timestamp
        )
      `;
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      reserved.release();
    }

    return credentialId;
  }

  it('should block cross-tenant access to shell_query_runs via GET endpoint', async () => {
    // Create Tenant A
    const tenantAId = await createTestTenant('eid-tenant-a', 'tssd-a');
    const userAId = await createTestUser('sf-user-tenant-a', tenantAId);
    const midA = 'mid-a';

    // Create Tenant B
    const tenantBId = await createTestTenant('eid-tenant-b', 'tssd-b');
    await createTestUser('sf-user-tenant-b', tenantBId);

    // Create a run owned by Tenant A + User A
    const runIdA = await createShellQueryRunWithContext(
      tenantAId,
      userAId,
      midA,
    );

    // Authenticate as Tenant B
    const { agent: tenantBAgent, csrfToken: csrfTokenB } =
      await createAuthenticatedAgent(
        'sf-user-tenant-b',
        'eid-tenant-b',
        'mid-b',
      );

    // Attempt to GET Tenant A's run as Tenant B
    const response = await tenantBAgent
      .get(`/runs/${runIdA}`)
      .set('x-csrf-token', csrfTokenB)
      .expect(404);

    // RLS should block access - returns 404 (not found), not 403 (forbidden)
    // This prevents information disclosure about run existence
    expect(response.body.detail || response.body.message).toMatch(
      /not found|RESOURCE_NOT_FOUND/i,
    );
  });

  it('should return empty results for cross-tenant queries at database level', async () => {
    // Create Tenant A with a run
    const tenantAId = await createTestTenant('eid-tenant-c', 'tssd-c');
    const userAId = await createTestUser('sf-user-tenant-c', tenantAId);
    const midA = 'mid-c';

    // Create multiple runs for Tenant A
    await createShellQueryRunWithContext(tenantAId, userAId, midA);
    await createShellQueryRunWithContext(tenantAId, userAId, midA);

    // Create Tenant B
    const tenantBId = await createTestTenant('eid-tenant-d', 'tssd-d');
    const userBId = await createTestUser('sf-user-tenant-d', tenantBId);
    const midB = 'mid-d';

    // Query shell_query_runs with Tenant B's context - should see nothing from Tenant A
    const reserved = await sqlClient.reserve();
    try {
      // Set RLS context for Tenant B
      await reserved`SELECT set_config('app.tenant_id', ${tenantBId}, false)`;
      await reserved`SELECT set_config('app.mid', ${midB}, false)`;
      await reserved`SELECT set_config('app.user_id', ${userBId}, false)`;

      // Query all runs - should return empty because Tenant B has no runs
      const result = await reserved`SELECT * FROM shell_query_runs`;

      expect(result.length).toBe(0);
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      reserved.release();
    }
  });

  it('should block cross-tenant access to credentials at database level', async () => {
    // Create Tenant A with credentials
    const tenantAId = await createTestTenant('eid-tenant-e', 'tssd-e');
    const userAId = await createTestUser('sf-user-tenant-e', tenantAId);
    const midA = 'mid-e';

    // Insert credentials for Tenant A
    await createCredentialsWithContext(tenantAId, userAId, midA);

    // Create Tenant B
    const tenantBId = await createTestTenant('eid-tenant-f', 'tssd-f');
    const midB = 'mid-f';

    // Query credentials with Tenant B's context
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantBId}, false)`;
      await reserved`SELECT set_config('app.mid', ${midB}, false)`;

      // Query all credentials - should be empty (Tenant B can't see Tenant A's credentials)
      const result = await reserved`SELECT * FROM credentials`;

      expect(result.length).toBe(0);
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      reserved.release();
    }
  });

  it('should allow same-tenant access (sanity check)', async () => {
    // Create Tenant G
    const tenantGId = await createTestTenant('eid-tenant-g', 'tssd-g');
    const userGId = await createTestUser('sf-user-tenant-g', tenantGId);
    const midG = 'mid-g';

    // Create a run owned by Tenant G
    const runIdG = await createShellQueryRunWithContext(
      tenantGId,
      userGId,
      midG,
    );

    // Query with Tenant G's RLS context - should see their own run
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantGId}, false)`;
      await reserved`SELECT set_config('app.mid', ${midG}, false)`;
      await reserved`SELECT set_config('app.user_id', ${userGId}, false)`;

      const result =
        await reserved`SELECT * FROM shell_query_runs WHERE id = ${runIdG}::uuid`;

      expect(result.length).toBe(1);
      const [row] = result;
      if (!row) {
        throw new Error('Expected query to return one shell_query_run');
      }
      expect(row.id).toBe(runIdG);
      expect(row.tenant_id).toBe(tenantGId);
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      reserved.release();
    }
  });
});
