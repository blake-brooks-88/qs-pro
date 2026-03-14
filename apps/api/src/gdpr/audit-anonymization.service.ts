import { Inject, Injectable, Logger } from '@nestjs/common';
import type { createDatabaseFromClient } from '@qpp/database';
import { and, auditLogs, eq } from '@qpp/database';

type Database = ReturnType<typeof createDatabaseFromClient>;

@Injectable()
export class AuditAnonymizationService {
  private readonly logger = new Logger(AuditAnonymizationService.name);

  constructor(
    @Inject('DATABASE')
    private readonly db: Database,
  ) {}

  async anonymizeForUser(userId: string, tenantId: string): Promise<number> {
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
