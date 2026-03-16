import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
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

import {
  cleanupGdprTestData,
  createTestOrgSubscription,
  createTestTenant,
  createTestUser,
} from '../../../test/helpers/gdpr-test-data';
import { AppModule } from '../../app.module';
import { STRIPE_CLIENT } from '../../billing/stripe.provider';
import { configureApp } from '../../configure-app';
import { TenantDeletionService } from '../tenant-deletion.service';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- trusted key
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const stripeMock = {
  subscriptions: { cancel: vi.fn().mockResolvedValue({}) },
};

describe('TenantDeletionService (integration)', () => {
  let app: NestFastifyApplication;
  let tenantDeletionService: TenantDeletionService;
  let sqlClient: Sql;

  let tenantId: string;
  let eid: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(STRIPE_CLIENT)
      .useValue(stripeMock)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
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

    tenantDeletionService = app.get(TenantDeletionService);
    sqlClient = app.get<Sql>('SQL_CLIENT');

    const result = await createTestTenant(sqlClient, 'tenant-del');
    tenantId = result.tenantId;
    eid = result.eid;

    await createTestOrgSubscription(sqlClient, tenantId, {
      stripeCustomerId: 'cus_gdpr_test',
      stripeSubscriptionId: 'sub_gdpr_test',
    });
  }, 60000);

  beforeEach(async () => {
    await sqlClient`UPDATE tenants SET deleted_at = NULL WHERE id = ${tenantId}::uuid`;
    await sqlClient`DELETE FROM deletion_ledger WHERE entity_id = ${tenantId}::uuid`;
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanupGdprTestData(tenantId);
    await app.close();
  }, 30000);

  it('should set deletedAt timestamp on tenant row', async () => {
    await tenantDeletionService.softDeleteTenant(tenantId, 'actor-1');

    const [row] = await sqlClient`
      SELECT deleted_at FROM tenants WHERE id = ${tenantId}::uuid
    `;

    expect(row?.deleted_at).not.toBeNull();
  });

  it('should cancel Stripe subscription with prorate: true', async () => {
    await tenantDeletionService.softDeleteTenant(tenantId, 'actor-1');

    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith(
      'sub_gdpr_test',
      { prorate: true },
    );
  });

  it('should not throw when Stripe cancellation fails', async () => {
    stripeMock.subscriptions.cancel.mockRejectedValueOnce(
      new Error('Stripe network error'),
    );

    await expect(
      tenantDeletionService.softDeleteTenant(tenantId, 'actor-1'),
    ).resolves.toBeUndefined();

    const [row] = await sqlClient`
      SELECT deleted_at FROM tenants WHERE id = ${tenantId}::uuid
    `;
    expect(row?.deleted_at).not.toBeNull();
  });

  it('should purge tenant Redis keys and queued BullMQ jobs', async () => {
    const redis = app.get<Redis>('REDIS_CLIENT');

    const { userId } = await createTestUser(sqlClient, tenantId, {
      sfUserId: `sf-gdpr-tenant-del-${crypto.randomUUID()}`,
      role: 'member',
    });

    const userSseKey = `sse-limit:${userId}`;
    const userThrottleKey = userId;

    await redis.set(userSseKey, '1');
    await redis.set(userThrottleKey, '1');

    const bullConnection = redis.duplicate();
    const shellQueue = new Queue('shell-query', {
      connection: bullConnection as never,
    });
    const siemQueue = new Queue('siem-webhook', {
      connection: bullConnection as never,
    });

    try {
      const shellJob = await shellQueue.add('execute-shell-query', {
        tenantId,
      });
      const siemJob = await siemQueue.add('deliver-webhook', { tenantId });

      await tenantDeletionService.softDeleteTenant(tenantId, 'actor-1');

      expect(await redis.get(userSseKey)).toBeNull();
      expect(await redis.get(userThrottleKey)).toBeNull();

      const shellJobs = await shellQueue.getJobs([
        'waiting',
        'delayed',
        'active',
        'completed',
        'failed',
      ]);
      expect(shellJobs.some((job) => job.id === shellJob.id)).toBe(false);

      const siemJobs = await siemQueue.getJobs([
        'waiting',
        'delayed',
        'active',
        'completed',
        'failed',
      ]);
      expect(siemJobs.some((job) => job.id === siemJob.id)).toBe(false);
    } finally {
      await shellQueue.close();
      await siemQueue.close();
      await bullConnection.quit();
    }
  });

  it('should create deletion ledger entry', async () => {
    await tenantDeletionService.softDeleteTenant(tenantId, 'actor-1');

    const [ledgerRow] = await sqlClient`
      SELECT entity_type, entity_identifier, deleted_by
      FROM deletion_ledger
      WHERE entity_id = ${tenantId}::uuid
    `;

    expect(ledgerRow).toBeDefined();
    expect(ledgerRow?.entity_type).toBe('tenant');
    expect(ledgerRow?.entity_identifier).toBe(eid);
    expect(ledgerRow?.deleted_by).toBe('admin:actor-1');
  });

  it('should throw when tenant does not exist', async () => {
    const randomId = crypto.randomUUID();

    await expect(
      tenantDeletionService.softDeleteTenant(randomId, 'actor-1'),
    ).rejects.toThrow('Tenant not found');
  });
});
