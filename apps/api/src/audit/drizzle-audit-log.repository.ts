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
  users,
} from '@qpp/database';
import type { AuditLogQueryParams } from '@qpp/shared-types';
import { alias } from 'drizzle-orm/pg-core';

import type { IAuditLogRepository, NewAuditLogEntry } from './audit.repository';

type Database = ReturnType<typeof createDatabaseFromClient>;

export type AuditLogRow = typeof auditLogs.$inferSelect;

export interface AuditLogRowResolved extends AuditLogRow {
  actorName: string | null;
  actorEmail: string | null;
  targetName: string | null;
  targetEmail: string | null;
}

const actorUser = alias(users, 'actor_user');
const targetUser = alias(users, 'target_user');

const targetUserId = sql<string | null>`
  CASE
    WHEN ${auditLogs.targetId} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN ${auditLogs.targetId}::uuid
    ELSE NULL
  END
`;

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
  ): Promise<{ items: AuditLogRowResolved[]; total: number }> {
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
      // Casts JSONB to text for substring matching. The existing GIN index
      // (jsonb_path_ops) does not accelerate ILIKE; a pg_trgm index on
      // metadata::text would help if this becomes a bottleneck. Acceptable
      // for now because RLS scoping (tenant_id + mid) limits the scan set.
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
        .select({
          id: auditLogs.id,
          tenantId: auditLogs.tenantId,
          mid: auditLogs.mid,
          eventType: auditLogs.eventType,
          actorType: auditLogs.actorType,
          actorId: auditLogs.actorId,
          targetId: auditLogs.targetId,
          metadata: auditLogs.metadata,
          ipAddress: auditLogs.ipAddress,
          userAgent: auditLogs.userAgent,
          createdAt: auditLogs.createdAt,
          actorName: actorUser.name,
          actorEmail: actorUser.email,
          targetName: targetUser.name,
          targetEmail: targetUser.email,
        })
        .from(auditLogs)
        .leftJoin(
          actorUser,
          and(
            eq(auditLogs.actorId, actorUser.id),
            eq(actorUser.tenantId, auditLogs.tenantId),
          ),
        )
        .leftJoin(
          targetUser,
          and(
            eq(targetUser.id, targetUserId),
            eq(targetUser.tenantId, auditLogs.tenantId),
          ),
        )
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
