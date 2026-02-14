export const AUDIT_LOG_REPOSITORY = 'AUDIT_LOG_REPOSITORY';

export interface NewAuditLogEntry {
  tenantId: string;
  mid: string;
  eventType: string;
  actorType: 'user' | 'system';
  actorId: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface IAuditLogRepository {
  insert(entry: NewAuditLogEntry): Promise<void>;
}
