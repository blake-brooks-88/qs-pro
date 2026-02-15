import { Inject, Injectable, Logger } from '@nestjs/common';
import { RlsContextService } from '@qpp/backend-shared';
import type { AuditEventType, AuditLogQueryParams } from '@qpp/shared-types';

import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from './audit.repository';
import type { AuditLogRow } from './drizzle-audit-log.repository';

export interface AuditLogEntry {
  eventType: AuditEventType;
  actorType: 'user' | 'system';
  actorId: string | null;
  tenantId: string;
  mid: string;
  targetId: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly rlsContext: RlsContextService,
  ) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.rlsContext.runWithTenantContext(
        entry.tenantId,
        entry.mid,
        async () => {
          await this.auditLogRepo.insert({
            tenantId: entry.tenantId,
            mid: entry.mid,
            eventType: entry.eventType,
            actorType: entry.actorType,
            actorId: entry.actorId,
            targetId: entry.targetId,
            metadata: entry.metadata ?? null,
            ipAddress: entry.ipAddress ?? null,
            userAgent: entry.userAgent ?? null,
          });
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to write audit log event=${entry.eventType}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async findAll(
    tenantId: string,
    mid: string,
    params: AuditLogQueryParams,
  ): Promise<{ items: AuditLogRow[]; total: number }> {
    return this.rlsContext.runWithTenantContext(tenantId, mid, () =>
      this.auditLogRepo.findAll(params),
    );
  }
}
