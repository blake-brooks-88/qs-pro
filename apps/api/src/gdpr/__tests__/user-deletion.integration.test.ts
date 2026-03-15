import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService, ErrorCode } from '@qpp/backend-shared';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  cleanupGdprTestData,
  createTestAuditLog,
  createTestCredential,
  createTestFolder,
  createTestSavedQuery,
  createTestSnippet,
  createTestTenant,
  createTestUser,
} from '../../../test/helpers/gdpr-test-data';
import { setTestTenantTier } from '../../../test/helpers/set-test-tenant-tier';
import { AppModule } from '../../app.module';
import { configureApp } from '../../configure-app';
import { UserDeletionService } from '../user-deletion.service';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- trusted key
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_MID = 'mid-gdpr-userdel';

describe('UserDeletionService (integration)', () => {
  let app: NestFastifyApplication;
  let userDeletionService: UserDeletionService;
  let encryptionService: EncryptionService;
  let sqlClient: Sql;

  let tenantId: string;
  let ownerId: string;
  let otherTenantId: string;
  let otherTenantUserId: string;

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

    userDeletionService = app.get(UserDeletionService);
    encryptionService = app.get(EncryptionService);
    sqlClient = app.get<Sql>('SQL_CLIENT');

    const tenant = await createTestTenant(sqlClient, 'user-del');
    tenantId = tenant.tenantId;

    const owner = await createTestUser(sqlClient, tenantId, {
      sfUserId: 'sf-gdpr-owner',
      role: 'owner',
      name: 'GDPR Owner',
    });
    ownerId = owner.userId;

    await setTestTenantTier(sqlClient, tenantId, 'free');

    const otherTenant = await createTestTenant(sqlClient, 'user-del-other');
    otherTenantId = otherTenant.tenantId;

    const otherUser = await createTestUser(sqlClient, otherTenantId, {
      sfUserId: 'sf-gdpr-other-user',
      role: 'member',
    });
    otherTenantUserId = otherUser.userId;
  }, 60000);

  afterAll(async () => {
    await cleanupGdprTestData(tenantId);
    await cleanupGdprTestData(otherTenantId);
    await app.close();
  }, 30000);

  describe('Validation errors', () => {
    let validationTargetUserId: string;

    beforeAll(async () => {
      const target = await createTestUser(sqlClient, tenantId, {
        sfUserId: 'sf-gdpr-validation-target',
        role: 'member',
      });
      validationTargetUserId = target.userId;
    });

    it('should throw RESOURCE_NOT_FOUND when user does not exist', async () => {
      const randomId = crypto.randomUUID();

      try {
        await userDeletionService.deleteUser({
          tenantId,
          mid: TEST_MID,
          targetUserId: randomId,
          actorId: ownerId,
        });
        expect.fail('Expected deleteUser to throw');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe(
          ErrorCode.RESOURCE_NOT_FOUND,
        );
      }
    });

    it('should throw VALIDATION_ERROR when deleting the owner', async () => {
      try {
        await userDeletionService.deleteUser({
          tenantId,
          mid: TEST_MID,
          targetUserId: ownerId,
          actorId: validationTargetUserId,
        });
        expect.fail('Expected deleteUser to throw');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe(
          ErrorCode.VALIDATION_ERROR,
        );
      }
    });

    it('should throw VALIDATION_ERROR when deleting yourself', async () => {
      try {
        await userDeletionService.deleteUser({
          tenantId,
          mid: TEST_MID,
          targetUserId: validationTargetUserId,
          actorId: validationTargetUserId,
        });
        expect.fail('Expected deleteUser to throw');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe(
          ErrorCode.VALIDATION_ERROR,
        );
      }
    });

    it('should throw VALIDATION_ERROR when target belongs to different tenant', async () => {
      try {
        await userDeletionService.deleteUser({
          tenantId,
          mid: TEST_MID,
          targetUserId: otherTenantUserId,
          actorId: ownerId,
        });
        expect.fail('Expected deleteUser to throw');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe(
          ErrorCode.VALIDATION_ERROR,
        );
      }
    });
  });

  describe('Successful deletion', () => {
    let freshUserId: string;
    let personalFolderId: string;
    let sharedFolderId: string;
    let savedQueryId: string;
    let sharedSnippetId: string;
    let auditLogId: string;

    const encryptFn = (s: string) => encryptionService.encrypt(s) as string;

    beforeEach(async () => {
      const user = await createTestUser(sqlClient, tenantId, {
        sfUserId: `sf-gdpr-del-${Date.now()}`,
        role: 'member',
        name: 'Delete Target',
      });
      freshUserId = user.userId;

      const personalFolder = await createTestFolder(
        sqlClient,
        tenantId,
        TEST_MID,
        freshUserId,
        { name: 'Personal Folder', visibility: 'personal' },
      );
      personalFolderId = personalFolder.folderId;

      const sharedFolder = await createTestFolder(
        sqlClient,
        tenantId,
        TEST_MID,
        freshUserId,
        { name: 'Shared Folder', visibility: 'shared' },
      );
      sharedFolderId = sharedFolder.folderId;

      const savedQuery = await createTestSavedQuery(
        sqlClient,
        tenantId,
        TEST_MID,
        freshUserId,
        encryptFn,
        { name: 'User Query', folderId: personalFolderId },
      );
      savedQueryId = savedQuery.savedQueryId;

      await createTestSnippet(sqlClient, tenantId, TEST_MID, freshUserId, {
        title: 'Personal Snip',
        isShared: false,
      });

      const sharedSnippet = await createTestSnippet(
        sqlClient,
        tenantId,
        TEST_MID,
        freshUserId,
        { title: 'Shared Snip', isShared: true },
      );
      sharedSnippetId = sharedSnippet.snippetId;

      await createTestCredential(sqlClient, tenantId, TEST_MID, freshUserId);

      const auditLog = await createTestAuditLog(
        sqlClient,
        tenantId,
        TEST_MID,
        freshUserId,
      );
      auditLogId = auditLog.auditLogId;
    });

    it('should delete user row and credentials from database', async () => {
      await userDeletionService.deleteUser({
        tenantId,
        mid: TEST_MID,
        targetUserId: freshUserId,
        actorId: ownerId,
      });

      const userRows = await sqlClient`
        SELECT id FROM users WHERE id = ${freshUserId}::uuid
      `;
      expect(userRows).toHaveLength(0);

      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        const credRows = await reserved`
          SELECT id FROM credentials WHERE user_id = ${freshUserId}::uuid
        `;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        expect(credRows).toHaveLength(0);
      } finally {
        reserved.release();
      }
    });

    it('should create archive folder structure and reparent personal content', async () => {
      await userDeletionService.deleteUser({
        tenantId,
        mid: TEST_MID,
        targetUserId: freshUserId,
        actorId: ownerId,
      });

      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`SELECT set_config('app.user_id', ${ownerId}, false)`;

        const archiveRootRows = await reserved`
          SELECT id FROM folders
          WHERE name = 'Archived Users'
            AND user_id = ${ownerId}::uuid
            AND tenant_id = ${tenantId}::uuid
            AND mid = ${TEST_MID}
        `;
        expect(archiveRootRows.length).toBeGreaterThan(0);

        const personalFolderRows = await reserved`
          SELECT user_id FROM folders WHERE id = ${personalFolderId}::uuid
        `;
        expect(personalFolderRows[0]?.user_id).toBe(ownerId);

        const savedQueryRows = await reserved`
          SELECT user_id FROM saved_queries WHERE id = ${savedQueryId}::uuid
        `;
        expect(savedQueryRows[0]?.user_id).toBe(ownerId);

        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
      } finally {
        reserved.release();
      }
    });

    it('should null out userId on shared content', async () => {
      await userDeletionService.deleteUser({
        tenantId,
        mid: TEST_MID,
        targetUserId: freshUserId,
        actorId: ownerId,
      });

      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`SELECT set_config('app.user_id', ${ownerId}, false)`;

        const sharedFolderRows = await reserved`
          SELECT user_id FROM folders WHERE id = ${sharedFolderId}::uuid
        `;
        expect(sharedFolderRows[0]?.user_id).toBeNull();

        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
      } finally {
        reserved.release();
      }

      const snippetReserved = await sqlClient.reserve();
      try {
        await snippetReserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
        await snippetReserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        const sharedSnippetRows = await snippetReserved`
          SELECT user_id FROM snippets WHERE id = ${sharedSnippetId}::uuid
        `;
        await snippetReserved`RESET app.tenant_id`;
        await snippetReserved`RESET app.mid`;
        expect(sharedSnippetRows[0]?.user_id).toBeNull();
      } finally {
        snippetReserved.release();
      }
    });

    it('should anonymize audit logs', async () => {
      await userDeletionService.deleteUser({
        tenantId,
        mid: TEST_MID,
        targetUserId: freshUserId,
        actorId: ownerId,
      });

      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;

        const auditRows = await reserved`
          SELECT actor_id, ip_address, user_agent
          FROM audit_logs
          WHERE id = ${auditLogId}::uuid
        `;

        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;

        expect(auditRows).toHaveLength(1);
        expect(auditRows[0]?.actor_id).toBeNull();
        expect(auditRows[0]?.ip_address).toBeNull();
        expect(auditRows[0]?.user_agent).toBeNull();
      } finally {
        reserved.release();
      }
    });

    it('should create deletion ledger entry with null entityIdentifier', async () => {
      await userDeletionService.deleteUser({
        tenantId,
        mid: TEST_MID,
        targetUserId: freshUserId,
        actorId: ownerId,
      });

      const ledgerRows = await sqlClient`
        SELECT entity_type, entity_identifier, deleted_by, metadata
        FROM deletion_ledger
        WHERE entity_id = ${freshUserId}::uuid
      `;

      expect(ledgerRows).toHaveLength(1);
      expect(ledgerRows[0]?.entity_type).toBe('user');
      expect(ledgerRows[0]?.entity_identifier).toBeNull();
      expect(ledgerRows[0]?.deleted_by).toMatch(/^admin:/);
      expect(ledgerRows[0]?.metadata).toHaveProperty('archivedFolderIds');
      const folderIds = (ledgerRows[0]?.metadata as Record<string, unknown>)
        .archivedFolderIds as Record<string, string>;
      expect(folderIds).toHaveProperty(TEST_MID);
    });
  });

  describe('Multi-BU deletion (GDPR cross-BU erasure)', () => {
    const MID_A = 'mid-gdpr-multi-a';
    const MID_B = 'mid-gdpr-multi-b';

    it('should delete user data across multiple BUs', async () => {
      const encryptFn = (s: string) => encryptionService.encrypt(s) as string;

      const user = await createTestUser(sqlClient, tenantId, {
        sfUserId: `sf-gdpr-multi-${Date.now()}`,
        role: 'member',
        name: 'Multi-BU Target',
      });
      const targetId = user.userId;

      const folderA = await createTestFolder(
        sqlClient,
        tenantId,
        MID_A,
        targetId,
        { name: 'Personal A', visibility: 'personal' },
      );
      await createTestSavedQuery(
        sqlClient,
        tenantId,
        MID_A,
        targetId,
        encryptFn,
        {
          name: 'Query A',
          folderId: folderA.folderId,
        },
      );
      await createTestCredential(sqlClient, tenantId, MID_A, targetId);
      const auditA = await createTestAuditLog(
        sqlClient,
        tenantId,
        MID_A,
        targetId,
      );

      await createTestFolder(sqlClient, tenantId, MID_B, targetId, {
        name: 'Personal B',
        visibility: 'personal',
      });
      await createTestCredential(sqlClient, tenantId, MID_B, targetId);
      const auditB = await createTestAuditLog(
        sqlClient,
        tenantId,
        MID_B,
        targetId,
      );

      await userDeletionService.deleteUser({
        tenantId,
        mid: MID_A,
        targetUserId: targetId,
        actorId: ownerId,
      });

      const userRows = await sqlClient`
        SELECT id FROM users WHERE id = ${targetId}::uuid
      `;
      expect(userRows).toHaveLength(0);

      for (const mid of [MID_A, MID_B]) {
        const reserved = await sqlClient.reserve();
        try {
          await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
          await reserved`SELECT set_config('app.mid', ${mid}, false)`;
          const credRows = await reserved`
            SELECT id FROM credentials
            WHERE user_id = ${targetId}::uuid
          `;
          await reserved`RESET app.tenant_id`;
          await reserved`RESET app.mid`;
          expect(credRows, `credentials in ${mid}`).toHaveLength(0);
        } finally {
          reserved.release();
        }
      }

      for (const mid of [MID_A, MID_B]) {
        const reserved = await sqlClient.reserve();
        try {
          await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
          await reserved`SELECT set_config('app.mid', ${mid}, false)`;
          await reserved`SELECT set_config('app.user_id', ${ownerId}, false)`;
          const archiveRows = await reserved`
            SELECT id FROM folders
            WHERE name = 'Archived Users'
              AND user_id = ${ownerId}::uuid
              AND tenant_id = ${tenantId}::uuid
              AND mid = ${mid}
          `;
          expect(archiveRows.length, `archive root in ${mid}`).toBeGreaterThan(
            0,
          );
          await reserved`RESET app.tenant_id`;
          await reserved`RESET app.mid`;
          await reserved`RESET app.user_id`;
        } finally {
          reserved.release();
        }
      }

      for (const { auditLogId, mid } of [
        { auditLogId: auditA.auditLogId, mid: MID_A },
        { auditLogId: auditB.auditLogId, mid: MID_B },
      ]) {
        const reserved = await sqlClient.reserve();
        try {
          await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
          await reserved`SELECT set_config('app.mid', ${mid}, false)`;
          const auditRows = await reserved`
            SELECT actor_id, ip_address, user_agent
            FROM audit_logs WHERE id = ${auditLogId}::uuid
          `;
          await reserved`RESET app.tenant_id`;
          await reserved`RESET app.mid`;
          expect(auditRows).toHaveLength(1);
          expect(
            auditRows[0]?.actor_id,
            `audit anonymized in ${mid}`,
          ).toBeNull();
          expect(auditRows[0]?.ip_address).toBeNull();
          expect(auditRows[0]?.user_agent).toBeNull();
        } finally {
          reserved.release();
        }
      }

      const ledgerRows = await sqlClient`
        SELECT metadata FROM deletion_ledger
        WHERE entity_id = ${targetId}::uuid
      `;
      expect(ledgerRows).toHaveLength(1);
      const metadata = ledgerRows[0]?.metadata as Record<string, unknown>;
      expect(metadata).toHaveProperty('archivedFolderIds');
      const folderIds = metadata.archivedFolderIds as Record<string, string>;
      expect(folderIds).toHaveProperty(MID_A);
      expect(folderIds).toHaveProperty(MID_B);
    });
  });
});
