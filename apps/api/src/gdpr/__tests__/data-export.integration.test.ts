import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService, ErrorCode } from '@qpp/backend-shared';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  cleanupGdprTestData,
  createTestFolder,
  createTestSavedQuery,
  createTestShellQueryRun,
  createTestSnippet,
  createTestTenant,
  createTestUser,
} from '../../../test/helpers/gdpr-test-data';
import { setTestTenantTier } from '../../../test/helpers/set-test-tenant-tier';
import { AppModule } from '../../app.module';
import { configureApp } from '../../configure-app';
import { DataExportService } from '../data-export.service';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_MID = 'mid-gdpr-export';
const PLAIN_SQL_QUERY = 'SELECT SubscriberKey FROM _Subscribers';
const PLAIN_SQL_RUN = 'SELECT EmailAddress FROM _Subscribers';

describe('DataExportService (integration)', () => {
  let app: NestFastifyApplication;
  let dataExportService: DataExportService;
  let encryptionService: EncryptionService;
  let sqlClient: Sql;

  let tenantId: string;
  let userId: string;

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
    dataExportService = app.get(DataExportService);
    encryptionService = app.get(EncryptionService);

    const tenant = await createTestTenant(sqlClient, 'data-export');
    tenantId = tenant.tenantId;

    const user = await createTestUser(sqlClient, tenantId, {
      sfUserId: 'sf-gdpr-export',
      email: 'export@test.gdpr',
      name: 'Export User',
      role: 'member',
    });
    userId = user.userId;

    await setTestTenantTier(sqlClient, tenantId, 'free');

    const { folderId } = await createTestFolder(
      sqlClient,
      tenantId,
      TEST_MID,
      userId,
      { name: 'Export Folder' },
    );

    await createTestSavedQuery(
      sqlClient,
      tenantId,
      TEST_MID,
      userId,
      (s) => encryptionService.encrypt(s) as string,
      { name: 'Export Query', sqlText: PLAIN_SQL_QUERY, folderId },
    );

    await createTestSnippet(sqlClient, tenantId, userId, {
      title: 'Export Snippet',
      code: 'SELECT 1 FROM _Job',
    });

    await createTestShellQueryRun(
      sqlClient,
      tenantId,
      TEST_MID,
      userId,
      (s) => encryptionService.encrypt(s) as string,
      { sqlText: PLAIN_SQL_RUN },
    );
  }, 60000);

  afterAll(async () => {
    await cleanupGdprTestData(tenantId);
    await app.close();
  }, 30000);

  it('should include user profile data', async () => {
    const result = await dataExportService.exportUserData(
      tenantId,
      TEST_MID,
      userId,
    );

    expect(result.user).toMatchObject({
      email: 'export@test.gdpr',
      name: 'Export User',
      sfUserId: 'sf-gdpr-export',
      role: 'member',
    });
  });

  it('should include saved queries with decrypted SQL', async () => {
    const result = await dataExportService.exportUserData(
      tenantId,
      TEST_MID,
      userId,
    );

    expect(result.savedQueries.length).toBeGreaterThanOrEqual(1);
    const exportQuery = result.savedQueries.find(
      (q) => q.name === 'Export Query',
    );
    expect(exportQuery).toBeDefined();
    expect(exportQuery?.sql).toBe(PLAIN_SQL_QUERY);
  });

  it('should include folders', async () => {
    const result = await dataExportService.exportUserData(
      tenantId,
      TEST_MID,
      userId,
    );

    const folder = result.folders.find((f) => f.name === 'Export Folder');
    expect(folder).toBeDefined();
  });

  it('should include snippets', async () => {
    const result = await dataExportService.exportUserData(
      tenantId,
      TEST_MID,
      userId,
    );

    const snippet = result.snippets.find((s) => s.title === 'Export Snippet');
    expect(snippet).toBeDefined();
    expect(snippet?.code).toBe('SELECT 1 FROM _Job');
  });

  it('should include execution history with decrypted SQL', async () => {
    const result = await dataExportService.exportUserData(
      tenantId,
      TEST_MID,
      userId,
    );

    const run = result.queryExecutionHistory.find(
      (r) => r.sql === PLAIN_SQL_RUN,
    );
    expect(run).toBeDefined();
  });

  it('should throw RESOURCE_NOT_FOUND with correct ErrorCode', async () => {
    const randomId = crypto.randomUUID();

    try {
      await dataExportService.exportUserData(tenantId, TEST_MID, randomId);
      expect.fail('Expected an error to be thrown');
    } catch (error: unknown) {
      expect((error as { code: string }).code).toBe(
        ErrorCode.RESOURCE_NOT_FOUND,
      );
    }
  });

  it('should include exportedAt as valid ISO timestamp', async () => {
    const before = Date.now();

    const result = await dataExportService.exportUserData(
      tenantId,
      TEST_MID,
      userId,
    );

    const exportedAt = new Date(result.exportedAt);
    expect(exportedAt.toISOString()).toBe(result.exportedAt);
    expect(exportedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(exportedAt.getTime()).toBeLessThanOrEqual(Date.now() + 10_000);
  });
});
