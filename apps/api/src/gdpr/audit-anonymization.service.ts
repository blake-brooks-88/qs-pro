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
    // Enable the audit_anonymize flag on the current connection so the
    // audit_logs immutability trigger permits UPDATE operations.
    // When called inside an RLS context (reserved connection with an open
    // transaction), we set the flag directly on that connection instead of
    // opening a nested transaction (which the reserved connection cannot do).
    const reservedSql = getReservedSqlFromContext();
    if (reservedSql) {
      await reservedSql`SELECT set_config('app.audit_anonymize', 'on', false)`;
    } else {
      await this.db.execute(
        sql`SELECT set_config('app.audit_anonymize', 'on', false)`,
      );
    }

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
}
