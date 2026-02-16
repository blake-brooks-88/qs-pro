import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  isUnrecoverable,
  QueryDefinitionService,
  RlsContextService,
} from "@qpp/backend-shared";
import {
  and,
  auditLogs,
  credentials,
  eq,
  isNotNull,
  type PostgresJsDatabase,
  tenantSettings,
} from "@qpp/database";
import type { AuditEventType } from "@qpp/shared-types";

@Injectable()
export class ShellQuerySweeper {
  private readonly logger = new Logger(ShellQuerySweeper.name);
  private readonly sweeperEventType: AuditEventType = "system.sweeper_run";

  constructor(
    private readonly queryDefinitionService: QueryDefinitionService,
    private readonly rlsContext: RlsContextService,
    @Inject("DATABASE")
    private readonly db: PostgresJsDatabase<Record<string, never>>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleSweep() {
    this.logger.log("Starting hourly shell query asset sweep...");

    const activeSettings = await this.db
      .select({
        tenantId: tenantSettings.tenantId,
        mid: tenantSettings.mid,
        qppFolderId: tenantSettings.qppFolderId,
      })
      .from(tenantSettings)
      .where(isNotNull(tenantSettings.qppFolderId));

    for (const setting of activeSettings) {
      if (!setting.qppFolderId) {
        continue;
      }
      try {
        await this.sweepTenantMid(
          setting.tenantId,
          setting.mid,
          setting.qppFolderId,
        );
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        this.logger.error(
          `Sweep failed for tenant ${setting.tenantId} MID ${setting.mid}: ${message}`,
        );
      }
    }

    this.logger.log("Shell query asset sweep completed.");
  }

  private async sweepTenantMid(
    tenantId: string,
    mid: string,
    folderId: number,
  ): Promise<void> {
    await this.rlsContext.runWithTenantContext(tenantId, mid, async () => {
      const creds = await this.db
        .select({ userId: credentials.userId })
        .from(credentials)
        .where(
          and(eq(credentials.tenantId, tenantId), eq(credentials.mid, mid)),
        )
        .limit(1);

      const firstCred = creds[0];

      if (!firstCred?.userId) {
        this.logger.debug(
          `No credentials found for tenant ${tenantId} MID ${mid}, skipping sweep`,
        );
        return;
      }

      const { attemptedCount, deletedCount, failedCount } =
        await this.performSweep(tenantId, firstCred.userId, mid, folderId);

      try {
        await this.db.insert(auditLogs).values({
          tenantId,
          mid,
          eventType: this.sweeperEventType,
          actorType: "system",
          actorId: null,
          targetId: String(folderId),
          metadata: { attemptedCount, deletedCount, failedCount, folderId },
        });
      } catch (e: unknown) {
        this.logger.warn(
          `Failed to log sweeper audit event: ${e instanceof Error ? e.message : "Unknown"}`,
        );
      }
    });
  }

  private async performSweep(
    tenantId: string,
    userId: string,
    mid: string,
    folderId: number,
  ): Promise<{
    attemptedCount: number;
    deletedCount: number;
    failedCount: number;
  }> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const queries = await this.queryDefinitionService.retrieveByFolder(
      tenantId,
      userId,
      mid,
      folderId,
      yesterday,
    );

    let attemptedCount = 0;
    let deletedCount = 0;
    let failedCount = 0;

    for (const query of queries) {
      if (!query.objectId) {
        continue;
      }
      attemptedCount++;
      try {
        await this.queryDefinitionService.delete(
          tenantId,
          userId,
          mid,
          query.objectId,
        );
        deletedCount++;
        this.logger.log(`Deleted QueryDefinition: ${query.customerKey}`);
      } catch (error: unknown) {
        if (isUnrecoverable(error)) {
          throw error;
        }

        failedCount++;
        const message =
          error instanceof Error ? error.message : "Unknown error";
        this.logger.debug(
          `Failed to delete QueryDefinition ${query.customerKey}: ${message}`,
        );
      }
    }

    return { attemptedCount, deletedCount, failedCount };
  }
}
