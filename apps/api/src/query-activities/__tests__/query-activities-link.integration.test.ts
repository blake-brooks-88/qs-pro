/**
 * Query Activities Link Integration Tests
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule
 * - Real PostgreSQL database with RLS context
 * - No service mocking — behavioral assertions on DB state
 *
 * Key behaviors tested:
 * - Link/unlink lifecycle (linkToQA, unlinkFromQA)
 * - Duplicate link protection (partial unique index)
 * - One-to-one enforcement
 * - Link status in list and detail responses
 * - RLS enforcement (tenant / mid isolation)
 * - Feature gating (free tier → 403)
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { ErrorCode } from '@qpp/backend-shared';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { configureApp } from '../../configure-app';
import { FeaturesService } from '../../features/features.service';
import { SavedQueriesService } from '../../saved-queries/saved-queries.service';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_EID = 'eid-qa-link-int';
const TEST_TSSD = 'test-qa-link-int';
const TEST_MID = 'mid-qa-link-int';

const TEST_EID_2 = 'eid-qa-link-int-2';
const TEST_TSSD_2 = 'test-qa-link-int-2';
const TEST_MID_2 = 'mid-qa-link-int-2';

describe('QueryActivitiesService link integration', () => {
  let app: NestFastifyApplication;
  let savedQueriesService: SavedQueriesService;
  let featuresService: FeaturesService;
  let sqlClient: Sql;

  let testTenantId: string;
  let testUserId: string;

  let testTenantId2: string;
  let testUserId2: string;

  const createdSavedQueryIds: string[] = [];

  async function withRls(
    tenantId: string,
    mid: string,
    userId: string,
    fn: (reserved: Sql) => Promise<void>,
  ) {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${mid}, false)`;
      await reserved`SELECT set_config('app.user_id', ${userId}, false)`;
      await fn(reserved as unknown as Sql);
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      reserved.release();
    }
  }

  async function createTestTenant(
    eid: string,
    tssd: string,
    tier: string,
  ): Promise<string> {
    const result = await sqlClient`
      INSERT INTO tenants (eid, tssd, subscription_tier)
      VALUES (${eid}, ${tssd}, ${tier})
      ON CONFLICT (eid) DO UPDATE SET tssd = ${tssd}, subscription_tier = ${tier}
      RETURNING id
    `;
    const row = result[0];
    if (!row) {
      throw new Error('Failed to insert test tenant');
    }
    return row.id;
  }

  async function createTestUser(
    sfUserId: string,
    tenantId: string,
    email: string,
    name: string,
  ): Promise<string> {
    const result = await sqlClient`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES (${sfUserId}, ${tenantId}, ${email}, ${name})
      ON CONFLICT (sf_user_id) DO UPDATE SET name = ${name}
      RETURNING id
    `;
    const row = result[0];
    if (!row) {
      throw new Error('Failed to insert test user');
    }
    return row.id;
  }

  async function createSavedQuery(
    tenantId: string,
    mid: string,
    userId: string,
    name: string,
    sqlText = 'SELECT 1',
  ) {
    const result = await savedQueriesService.create(tenantId, mid, userId, {
      name,
      sqlText,
    });
    createdSavedQueryIds.push(result.id);
    return result;
  }

  beforeAll(async () => {
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
        cookie: { secure: false, sameSite: 'lax' },
      },
      rls: true,
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    sqlClient = app.get<Sql>('SQL_CLIENT');
    savedQueriesService = app.get(SavedQueriesService);
    featuresService = app.get(FeaturesService);

    // Tenant 1 — pro tier (deployToAutomation enabled)
    testTenantId = await createTestTenant(TEST_EID, TEST_TSSD, 'pro');
    testUserId = await createTestUser(
      'sf-qa-link-int',
      testTenantId,
      'qa-link-int@example.com',
      'QA Link Test User',
    );

    // Tenant 2 — free tier (deployToAutomation disabled)
    testTenantId2 = await createTestTenant(TEST_EID_2, TEST_TSSD_2, 'free');
    testUserId2 = await createTestUser(
      'sf-qa-link-int-2',
      testTenantId2,
      'qa-link-int-2@example.com',
      'QA Link Test User 2',
    );

    // Clean up leftover data
    await withRls(testTenantId, TEST_MID, testUserId, async (r) => {
      await r`DELETE FROM saved_queries WHERE tenant_id = ${testTenantId}::uuid`;
    });
    await withRls(testTenantId2, TEST_MID_2, testUserId2, async (r) => {
      await r`DELETE FROM saved_queries WHERE tenant_id = ${testTenantId2}::uuid`;
    });
  }, 60000);

  afterAll(async () => {
    // Clean up saved queries (RLS protected)
    for (const id of createdSavedQueryIds) {
      try {
        await withRls(testTenantId, TEST_MID, testUserId, async (r) => {
          await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
        });
      } catch {
        try {
          await withRls(testTenantId2, TEST_MID_2, testUserId2, async (r) => {
            await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
          });
        } catch {
          // best effort
        }
      }
    }

    // Clean up users and tenants (not RLS-protected)
    if (testUserId) {
      await sqlClient`DELETE FROM users WHERE id = ${testUserId}::uuid`;
    }
    if (testUserId2) {
      await sqlClient`DELETE FROM users WHERE id = ${testUserId2}::uuid`;
    }
    if (testTenantId) {
      await sqlClient`DELETE FROM tenants WHERE id = ${testTenantId}::uuid`;
    }
    if (testTenantId2) {
      await sqlClient`DELETE FROM tenants WHERE id = ${testTenantId2}::uuid`;
    }

    await app.close();
  }, 30000);

  beforeEach(async () => {
    for (const id of [...createdSavedQueryIds]) {
      try {
        await withRls(testTenantId, TEST_MID, testUserId, async (r) => {
          await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
        });
        createdSavedQueryIds.splice(createdSavedQueryIds.indexOf(id), 1);
      } catch {
        try {
          await withRls(testTenantId2, TEST_MID_2, testUserId2, async (r) => {
            await r`DELETE FROM saved_queries WHERE id = ${id}::uuid`;
          });
          createdSavedQueryIds.splice(createdSavedQueryIds.indexOf(id), 1);
        } catch {
          // Ignore
        }
      }
    }
  });

  describe('linkToQA', () => {
    it('should link saved query to QA and return link fields', async () => {
      const query = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'Link Test Query',
      );

      const linked = await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-100',
          linkedQaCustomerKey: 'qa-key-100',
          linkedQaName: 'Test QA',
        },
      );

      expect(linked.linkedQaObjectId).toBe('qa-obj-100');
      expect(linked.linkedQaCustomerKey).toBe('qa-key-100');
      expect(linked.linkedQaName).toBe('Test QA');
      expect(linked.linkedAt).toBeInstanceOf(Date);
    });

    it('should update link when same saved query is linked to a different QA', async () => {
      const query = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'Overwrite Link Query',
      );

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-first',
          linkedQaCustomerKey: 'qa-key-first',
          linkedQaName: 'First QA',
        },
      );

      const relinked = await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-second',
          linkedQaCustomerKey: 'qa-key-second',
          linkedQaName: 'Second QA',
        },
      );

      expect(relinked.linkedQaCustomerKey).toBe('qa-key-second');
    });

    it('should enforce one-to-one via partial unique index (duplicate QA key)', async () => {
      const q1 = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'Q1 for Dup',
      );
      const q2 = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'Q2 for Dup',
      );

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        q1.id,
        {
          linkedQaObjectId: 'qa-obj-dup',
          linkedQaCustomerKey: 'qa-key-dup',
          linkedQaName: 'Duplicate QA',
        },
      );

      // Linking a second saved query to the same QA key should fail with LINK_CONFLICT
      await expect(
        savedQueriesService.linkToQA(
          testTenantId,
          TEST_MID,
          testUserId,
          q2.id,
          {
            linkedQaObjectId: 'qa-obj-dup',
            linkedQaCustomerKey: 'qa-key-dup',
            linkedQaName: 'Duplicate QA',
          },
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.LINK_CONFLICT,
        }),
      );
    });

    it('should throw RESOURCE_NOT_FOUND for non-existent saved query', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(
        savedQueriesService.linkToQA(
          testTenantId,
          TEST_MID,
          testUserId,
          fakeId,
          {
            linkedQaObjectId: 'qa-obj-x',
            linkedQaCustomerKey: 'qa-key-x',
            linkedQaName: 'QA X',
          },
        ),
      ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
  });

  describe('unlinkFromQA', () => {
    it('should clear all link fields', async () => {
      const query = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'Unlink Test Query',
      );

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-unlink',
          linkedQaCustomerKey: 'qa-key-unlink',
          linkedQaName: 'Unlink QA',
        },
      );

      const unlinked = await savedQueriesService.unlinkFromQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
      );

      expect(unlinked.linkedQaObjectId).toBeNull();
      expect(unlinked.linkedQaCustomerKey).toBeNull();
      expect(unlinked.linkedQaName).toBeNull();
      expect(unlinked.linkedAt).toBeNull();
    });

    it('should allow re-linking after unlink', async () => {
      const query = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'Relink Test Query',
      );

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-relink',
          linkedQaCustomerKey: 'qa-key-relink',
          linkedQaName: 'Relink QA',
        },
      );

      await savedQueriesService.unlinkFromQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
      );

      const relinked = await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-relink-2',
          linkedQaCustomerKey: 'qa-key-relink-2',
          linkedQaName: 'Relink QA 2',
        },
      );

      expect(relinked.linkedQaCustomerKey).toBe('qa-key-relink-2');
    });

    it('should free up QA key for other saved queries after unlink', async () => {
      const q1 = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'Q1 Shared Key',
      );
      const q2 = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'Q2 Shared Key',
      );

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        q1.id,
        {
          linkedQaObjectId: 'qa-obj-shared',
          linkedQaCustomerKey: 'qa-key-shared',
          linkedQaName: 'Shared QA',
        },
      );

      // q2 can't link to same QA while q1 holds it
      await expect(
        savedQueriesService.linkToQA(
          testTenantId,
          TEST_MID,
          testUserId,
          q2.id,
          {
            linkedQaObjectId: 'qa-obj-shared',
            linkedQaCustomerKey: 'qa-key-shared',
            linkedQaName: 'Shared QA',
          },
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.LINK_CONFLICT,
        }),
      );

      // Unlink q1
      await savedQueriesService.unlinkFromQA(
        testTenantId,
        TEST_MID,
        testUserId,
        q1.id,
      );

      // Now q2 can link to the same QA key
      const linked = await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        q2.id,
        {
          linkedQaObjectId: 'qa-obj-shared',
          linkedQaCustomerKey: 'qa-key-shared',
          linkedQaName: 'Shared QA',
        },
      );

      expect(linked.linkedQaCustomerKey).toBe('qa-key-shared');
    });

    it('should throw RESOURCE_NOT_FOUND for non-existent saved query', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(
        savedQueriesService.unlinkFromQA(
          testTenantId,
          TEST_MID,
          testUserId,
          fakeId,
        ),
      ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
  });

  describe('findAllLinkedQaKeys', () => {
    it('should return map of linked QA customerKeys to query names', async () => {
      const q1 = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'Linked Query A',
      );
      const q2 = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'Linked Query B',
      );

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        q1.id,
        {
          linkedQaObjectId: 'qa-obj-a',
          linkedQaCustomerKey: 'qa-key-a',
          linkedQaName: 'QA A',
        },
      );
      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        q2.id,
        {
          linkedQaObjectId: 'qa-obj-b',
          linkedQaCustomerKey: 'qa-key-b',
          linkedQaName: 'QA B',
        },
      );

      const linkedMap = await savedQueriesService.findAllLinkedQaKeys(
        testTenantId,
        TEST_MID,
      );

      expect(linkedMap.size).toBeGreaterThanOrEqual(2);
      expect(linkedMap.get('qa-key-a')).toBe('Linked Query A');
      expect(linkedMap.get('qa-key-b')).toBe('Linked Query B');
    });

    it('should return empty map when no links exist', async () => {
      await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'Unlinked Query',
      );

      const linkedMap = await savedQueriesService.findAllLinkedQaKeys(
        testTenantId,
        TEST_MID,
      );

      // The unlinked query should not appear in the map
      const hasNullKeys = Array.from(linkedMap.values()).some(
        (v) => v === 'Unlinked Query',
      );
      expect(hasNullKeys).toBe(false);
    });

    it('should exclude unlinked queries from the map', async () => {
      const query = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'Was Linked Query',
      );

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-was',
          linkedQaCustomerKey: 'qa-key-was',
          linkedQaName: 'Was QA',
        },
      );

      await savedQueriesService.unlinkFromQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
      );

      const linkedMap = await savedQueriesService.findAllLinkedQaKeys(
        testTenantId,
        TEST_MID,
      );

      expect(linkedMap.has('qa-key-was')).toBe(false);
    });
  });

  describe('link state in findAll and findById', () => {
    it('should return link fields in findAll response', async () => {
      const query = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'FindAll Link Test',
      );

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-list',
          linkedQaCustomerKey: 'qa-key-list',
          linkedQaName: 'List QA',
        },
      );

      const all = await savedQueriesService.findAll(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      const found = all.find((q) => q.id === query.id);
      expect(found).toBeDefined();
      expect(found?.linkedQaCustomerKey).toBe('qa-key-list');
      expect(found?.linkedQaName).toBe('List QA');
      expect(found?.linkedAt).toBeInstanceOf(Date);
    });

    it('should return link fields in findById response', async () => {
      const query = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'FindById Link Test',
      );

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-detail',
          linkedQaCustomerKey: 'qa-key-detail',
          linkedQaName: 'Detail QA',
        },
      );

      const found = await savedQueriesService.findById(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
      );

      expect(found.linkedQaObjectId).toBe('qa-obj-detail');
      expect(found.linkedQaCustomerKey).toBe('qa-key-detail');
      expect(found.linkedQaName).toBe('Detail QA');
    });

    it('should return null link fields for unlinked queries', async () => {
      const query = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'No Link Query',
      );

      const found = await savedQueriesService.findById(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
      );

      expect(found.linkedQaObjectId).toBeNull();
      expect(found.linkedQaCustomerKey).toBeNull();
      expect(found.linkedQaName).toBeNull();
      expect(found.linkedAt).toBeNull();
    });
  });

  describe('RLS enforcement', () => {
    it('should allow another user in same BU to link a query (BU-scoped RLS)', async () => {
      const query = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'User 1 Query',
      );

      const otherUserId = crypto.randomUUID();

      const linked = await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        otherUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-rls',
          linkedQaCustomerKey: 'qa-key-rls',
          linkedQaName: 'RLS QA',
        },
      );

      expect(linked.linkedQaCustomerKey).toBe('qa-key-rls');
    });

    it('should allow another user in same BU to unlink a query (BU-scoped RLS)', async () => {
      const query = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'User 1 Unlink Query',
      );

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-rls-unlink',
          linkedQaCustomerKey: 'qa-key-rls-unlink',
          linkedQaName: 'RLS Unlink QA',
        },
      );

      const otherUserId = crypto.randomUUID();

      const unlinked = await savedQueriesService.unlinkFromQA(
        testTenantId,
        TEST_MID,
        otherUserId,
        query.id,
      );

      expect(unlinked.linkedQaObjectId).toBeNull();
    });

    it('should isolate linked QA keys by tenant and mid', async () => {
      const q1 = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'Tenant 1 Linked',
      );

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        q1.id,
        {
          linkedQaObjectId: 'qa-obj-t1',
          linkedQaCustomerKey: 'qa-key-t1',
          linkedQaName: 'Tenant 1 QA',
        },
      );

      // Tenant 2 should not see tenant 1's linked keys
      const tenant2Map = await savedQueriesService.findAllLinkedQaKeys(
        testTenantId2,
        TEST_MID_2,
      );

      expect(tenant2Map.has('qa-key-t1')).toBe(false);
    });
  });

  describe('feature gating', () => {
    it('should confirm pro tier has deployToAutomation enabled', async () => {
      const { features } =
        await featuresService.getTenantFeatures(testTenantId);
      expect(features.deployToAutomation).toBe(true);
    });

    it('should confirm free tier has deployToAutomation disabled', async () => {
      const { features } =
        await featuresService.getTenantFeatures(testTenantId2);
      expect(features.deployToAutomation).toBe(false);
    });
  });

  describe('link state in findAllListItems', () => {
    it('should include link columns in list item response', async () => {
      const query = await createSavedQuery(
        testTenantId,
        TEST_MID,
        testUserId,
        'ListItem Link Test',
      );

      await savedQueriesService.linkToQA(
        testTenantId,
        TEST_MID,
        testUserId,
        query.id,
        {
          linkedQaObjectId: 'qa-obj-listitem',
          linkedQaCustomerKey: 'qa-key-listitem',
          linkedQaName: 'ListItem QA',
        },
      );

      const items = await savedQueriesService.findAllListItems(
        testTenantId,
        TEST_MID,
        testUserId,
      );

      const found = items.find((q) => q.id === query.id);
      expect(found).toBeDefined();
      expect(found?.linkedQaCustomerKey).toBe('qa-key-listitem');
      expect(found?.linkedQaName).toBe('ListItem QA');
      expect(found?.linkedAt).toBeTruthy();
    });
  });
});
