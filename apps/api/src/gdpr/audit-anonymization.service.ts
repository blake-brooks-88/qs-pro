import { Inject, Injectable, Logger } from '@nestjs/common';
import { getReservedSqlFromContext } from '@qpp/backend-shared';
import type { createDatabaseFromClient } from '@qpp/database';
import { and, auditLogs, eq, sql } from '@qpp/database';

type Database = ReturnType<typeof createDatabaseFromClient>;

@Injectable()
export class AuditAnonymizationService {
  private readonly logger = new Logger(AuditAnonymizationService.name);

  constructor(
    @Inject('DATABASE')
    private readonly db: Database,
  ) {}

  async anonymizeForUser(userId: string, tenantId: string): Promise<number> {
    const reservedSql = getReservedSqlFromContext();
    if (reservedSql) {
      // Inside an RLS reserved connection with an open transaction —
      // set the flag as transaction-local so it cannot leak to other requests.
      await reservedSql`SELECT set_config('app.audit_anonymize', 'on', true)`;

      const rows = await this.db
        .update(auditLogs)
        .set({
          actorId: null,
          ipAddress: null,
          userAgent: null,
        })
        .where(
          and(eq(auditLogs.actorId, userId), eq(auditLogs.tenantId, tenantId)),
        )
        .returning({ id: auditLogs.id });

      this.logger.log(
        `Anonymized ${rows.length} audit log entries for user=${userId} tenant=${tenantId}`,
      );
      return rows.length;
    }

    // No reserved connection — wrap in a transaction so the flag and
    // update share the same connection and the flag is auto-cleared on commit.
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.audit_anonymize', 'on', true)`,
      );

      const rows = await tx
        .update(auditLogs)
        .set({
          actorId: null,
          ipAddress: null,
          userAgent: null,
        })
        .where(
          and(eq(auditLogs.actorId, userId), eq(auditLogs.tenantId, tenantId)),
        )
        .returning({ id: auditLogs.id });

      this.logger.log(
        `Anonymized ${rows.length} audit log entries for user=${userId} tenant=${tenantId}`,
      );
      return rows.length;
    });
  }
}
