import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PostgresJsDatabase } from "@qpp/database";
import { backofficeAuditLogs, desc, eq } from "@qpp/database";

import { DRIZZLE_DB } from "../database/database.module.js";

export interface AuditLogParams {
  backofficeUserId: string;
  targetTenantId?: string;
  eventType: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class BackofficeAuditService {
  private readonly logger = new Logger(BackofficeAuditService.name);

  constructor(@Inject(DRIZZLE_DB) private readonly db: PostgresJsDatabase) {}

  async log(params: AuditLogParams): Promise<void> {
    try {
      await this.db
        .insert(backofficeAuditLogs)
        .values({
          backofficeUserId: params.backofficeUserId,
          targetTenantId: params.targetTenantId,
          eventType: params.eventType,
          metadata: params.metadata,
          ipAddress: params.ipAddress,
        })
        .execute();
    } catch (error) {
      this.logger.error("Failed to write audit log", error);
    }
  }

  async getLogsForTenant(
    tenantId: string,
    options: { limit?: number; offset?: number } = {},
  ) {
    const { limit = 50, offset = 0 } = options;

    return this.db
      .select()
      .from(backofficeAuditLogs)
      .where(eq(backofficeAuditLogs.targetTenantId, tenantId))
      .orderBy(desc(backofficeAuditLogs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getAllLogs(
    options: { limit?: number; offset?: number; eventType?: string } = {},
  ) {
    const { limit = 50, offset = 0, eventType } = options;

    const base = this.db.select().from(backofficeAuditLogs);
    const filtered = eventType
      ? base.where(eq(backofficeAuditLogs.eventType, eventType))
      : base;

    return filtered
      .orderBy(desc(backofficeAuditLogs.createdAt))
      .limit(limit)
      .offset(offset);
  }
}
