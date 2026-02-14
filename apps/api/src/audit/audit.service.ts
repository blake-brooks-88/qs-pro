import { Inject, Injectable, Logger } from '@nestjs/common';
import { RlsContextService } from '@qpp/backend-shared';

import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from './audit.repository';

export interface AuditLogEntry {
  eventType: string;
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
}
