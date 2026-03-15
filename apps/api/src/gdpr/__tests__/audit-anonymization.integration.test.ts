import { Test, TestingModule } from '@nestjs/testing';
import { runWithDbContext } from '@qpp/backend-shared';
import { createDatabaseFromClient } from '@qpp/database';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  cleanupGdprTestData,
  createTestAuditLog,
  createTestTenant,
  createTestUser,
} from '../../../test/helpers/gdpr-test-data';
import { AppModule } from '../../app.module';
import { AuditAnonymizationService } from '../audit-anonymization.service';

const TEST_MID = 'mid-gdpr-audit-anon';

function makeDrizzleCompatibleSql(base: Sql, reserved: Sql): Sql {
  const reservedWithMeta = reserved as Sql & {
    options: Sql['options'];
    parameters: Sql['parameters'];
  };

  if (!('options' in reservedWithMeta)) {
    Object.defineProperty(reservedWithMeta, 'options', {
      value: base.options,
      enumerable: false,
    });
  }

  if (!('parameters' in reservedWithMeta)) {
    Object.defineProperty(reservedWithMeta, 'parameters', {
      value: base.parameters,
      enumerable: false,
    });
  }

  return reservedWithMeta;
}

describe('AuditAnonymizationService (integration)', () => {
  let moduleFixture: TestingModule;
  let auditAnonymizationService: AuditAnonymizationService;
  let sqlClient: Sql;

  let tenantId: string;
  let userIdA: string;
  let userIdB: string;
  let auditLogIdA: string;
  let auditLogIdB: string;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    auditAnonymizationService = moduleFixture.get(AuditAnonymizationService);
    sqlClient = moduleFixture.get<Sql>('SQL_CLIENT');

    const tenant = await createTestTenant(sqlClient, 'audit-anon');
    tenantId = tenant.tenantId;

    const userA = await createTestUser(sqlClient, tenantId, {
      sfUserId: 'sf-gdpr-audit-anon-a',
      role: 'member',
    });
    userIdA = userA.userId;

    const userB = await createTestUser(sqlClient, tenantId, {
      sfUserId: 'sf-gdpr-audit-anon-b',
      role: 'member',
    });
    userIdB = userB.userId;

    const auditA = await createTestAuditLog(
      sqlClient,
      tenantId,
      TEST_MID,
      userIdA,
      {
        ipAddress: '10.1.2.3',
        userAgent: 'agent-a',
        eventType: 'gdpr.audit-anon.a',
      },
    );
    auditLogIdA = auditA.auditLogId;

    const auditB = await createTestAuditLog(
      sqlClient,
      tenantId,
      TEST_MID,
      userIdB,
      {
        ipAddress: '10.4.5.6',
        userAgent: 'agent-b',
        eventType: 'gdpr.audit-anon.b',
      },
    );
    auditLogIdB = auditB.auditLogId;
  }, 60000);

  afterAll(async () => {
    await cleanupGdprTestData(tenantId);
    await moduleFixture.close();
  }, 30000);

  it('anonymizes audit logs with and without a reserved connection context', async () => {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;

      const compatibleReserved = makeDrizzleCompatibleSql(sqlClient, reserved);
      const reservedDb = createDatabaseFromClient(compatibleReserved);

      // Simulate the real request path: reserved connection with an open transaction,
      // so the transaction-local anonymization flag persists for the UPDATE.
      await reserved`BEGIN`;
      const reservedBranchCount = await runWithDbContext(
        reservedDb,
        () =>
          auditAnonymizationService.anonymizeForUser(
            userIdA,
            tenantId,
            TEST_MID,
          ),
        compatibleReserved,
      );
      await reserved`COMMIT`;
      expect(reservedBranchCount).toBe(1);

      const transactionBranchCount =
        await auditAnonymizationService.anonymizeForUser(
          userIdB,
          tenantId,
          TEST_MID,
        );
      expect(transactionBranchCount).toBe(1);

      const rowsA = await reserved`
        SELECT actor_id, ip_address, user_agent
        FROM audit_logs
        WHERE id = ${auditLogIdA}::uuid
      `;
      expect(rowsA).toHaveLength(1);
      expect(rowsA[0]?.actor_id).toBeNull();
      expect(rowsA[0]?.ip_address).toBeNull();
      expect(rowsA[0]?.user_agent).toBeNull();

      const rowsB = await reserved`
        SELECT actor_id, ip_address, user_agent
        FROM audit_logs
        WHERE id = ${auditLogIdB}::uuid
      `;
      expect(rowsB).toHaveLength(1);
      expect(rowsB[0]?.actor_id).toBeNull();
      expect(rowsB[0]?.ip_address).toBeNull();
      expect(rowsB[0]?.user_agent).toBeNull();

      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
    } finally {
      reserved.release();
    }
  });
});
