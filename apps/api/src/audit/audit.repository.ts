import type { AuditEventType, AuditLogQueryParams } from '@qpp/shared-types';

import type { AuditLogRow } from './drizzle-audit-log.repository';

export const AUDIT_LOG_REPOSITORY = 'AUDIT_LOG_REPOSITORY';

export interface NewAuditLogEntry {
  tenantId: string;
  mid: string;
  eventType: AuditEventType;
  actorType: 'user' | 'system';
  actorId: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface IAuditLogRepository {
  insert(entry: NewAuditLogEntry): Promise<void>;
  findAll(
    params: AuditLogQueryParams,
  ): Promise<{ items: AuditLogRow[]; total: number }>;
}
