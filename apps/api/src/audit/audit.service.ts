import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { RlsContextService } from '@qpp/backend-shared';
import type { ISiemWebhookConfigRepository } from '@qpp/database';
import type { AuditEventType, AuditLogQueryParams } from '@qpp/shared-types';
import { randomUUID } from 'crypto';

import { SIEM_WEBHOOK_CONFIG_REPOSITORY } from '../siem/siem.repository';
import type { SiemWebhookPayload } from '../siem/siem.types';
import { SiemWebhookProducer } from '../siem/siem-webhook.producer';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from './audit.repository';
import type { AuditLogRowResolved } from './drizzle-audit-log.repository';

export interface AuditLogEntry {
  eventType: AuditEventType;
  actorType: 'user' | 'system';
  actorId: string | null;
  actorEmail?: string | null;
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
    @Inject(SiemWebhookProducer)
    @Optional()
    private readonly siemProducer?: SiemWebhookProducer,
    @Inject(SIEM_WEBHOOK_CONFIG_REPOSITORY)
    @Optional()
    private readonly siemRepo?: ISiemWebhookConfigRepository,
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

          this.enqueueSiemWebhook(entry).catch((err) => {
            this.logger.warn(
              `SIEM webhook enqueue failed for event=${entry.eventType}: ${err instanceof Error ? err.message : String(err)}`,
            );
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
  ): Promise<{ items: AuditLogRowResolved[]; total: number }> {
    return this.rlsContext.runWithTenantContext(tenantId, mid, () =>
      this.auditLogRepo.findAll(params),
    );
  }

  private async enqueueSiemWebhook(entry: AuditLogEntry): Promise<void> {
    if (!this.siemProducer || !this.siemRepo) {
      return;
    }

    const config = await this.siemRepo.findByTenantId(entry.tenantId);
    if (!config?.enabled) {
      return;
    }

    const payload: SiemWebhookPayload = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      version: '1.0',
      tenantId: entry.tenantId,
      mid: entry.mid,
      event: {
        type: entry.eventType,
        actorType: entry.actorType,
        actorId: entry.actorId,
        actorEmail: entry.actorEmail ?? null,
        targetId: entry.targetId,
        ipAddress: entry.ipAddress ?? null,
        metadata: entry.metadata ?? null,
      },
    };

    await this.siemProducer.enqueue({
      payload,
      webhookUrl: config.webhookUrl,
      secretEncrypted: config.secretEncrypted,
      tenantId: entry.tenantId,
    });
  }
}
