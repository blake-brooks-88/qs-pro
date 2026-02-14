import { getDbFromContext } from '@qpp/backend-shared';
import { auditLogs, type createDatabaseFromClient } from '@qpp/database';

import type { IAuditLogRepository, NewAuditLogEntry } from './audit.repository';

type Database = ReturnType<typeof createDatabaseFromClient>;

export class DrizzleAuditLogRepository implements IAuditLogRepository {
  constructor(private readonly db: Database) {}

  private getDb(): Database {
    return (getDbFromContext() as Database) ?? this.db;
  }

  async insert(entry: NewAuditLogEntry): Promise<void> {
    await this.getDb().insert(auditLogs).values({
      tenantId: entry.tenantId,
      mid: entry.mid,
      eventType: entry.eventType,
      actorType: entry.actorType,
      actorId: entry.actorId,
      targetId: entry.targetId,
      metadata: entry.metadata,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    });
  }
}
