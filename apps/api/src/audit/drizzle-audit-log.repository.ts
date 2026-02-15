import { getDbFromContext } from '@qpp/backend-shared';
import {
  and,
  asc,
  auditLogs,
  count,
  type createDatabaseFromClient,
  desc,
  eq,
  gte,
  like,
  lte,
  sql,
} from '@qpp/database';
import type { AuditLogQueryParams } from '@qpp/shared-types';

import type { IAuditLogRepository, NewAuditLogEntry } from './audit.repository';

type Database = ReturnType<typeof createDatabaseFromClient>;

export type AuditLogRow = typeof auditLogs.$inferSelect;

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

  async findAll(
    params: AuditLogQueryParams,
  ): Promise<{ items: AuditLogRow[]; total: number }> {
    const conditions = [];

    if (params.eventType) {
      if (params.eventType.includes('*')) {
        conditions.push(
          like(auditLogs.eventType, params.eventType.replace(/\*/g, '%')),
        );
      } else {
        conditions.push(eq(auditLogs.eventType, params.eventType));
      }
    }

    if (params.actorId) {
      conditions.push(eq(auditLogs.actorId, params.actorId));
    }

    if (params.targetId) {
      conditions.push(eq(auditLogs.targetId, params.targetId));
    }

    if (params.dateFrom) {
      conditions.push(gte(auditLogs.createdAt, new Date(params.dateFrom)));
    }

    if (params.dateTo) {
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(params.dateTo);
      const endDate = isDateOnly
        ? new Date(params.dateTo + 'T23:59:59.999Z')
        : new Date(params.dateTo);
      conditions.push(lte(auditLogs.createdAt, endDate));
    }

    if (params.search) {
      conditions.push(
        sql`${auditLogs.metadata}::text ILIKE ${'%' + params.search + '%'}`,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumn = this.getSortColumn(params.sortBy);
    const sortDirection = params.sortDir === 'asc' ? asc : desc;
    const orderByClause = sortDirection(sortColumn);

    const db = this.getDb();

    const [items, countResult] = await Promise.all([
      db
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(orderByClause)
        .offset((params.page - 1) * params.pageSize)
        .limit(params.pageSize),
      db.select({ count: count() }).from(auditLogs).where(whereClause),
    ]);

    return {
      items,
      total: countResult[0]?.count ?? 0,
    };
  }

  private getSortColumn(sortBy: AuditLogQueryParams['sortBy']) {
    switch (sortBy) {
      case 'eventType':
        return auditLogs.eventType;
      case 'createdAt':
      default:
        return auditLogs.createdAt;
    }
  }
}
