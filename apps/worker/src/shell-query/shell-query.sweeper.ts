import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  QueryDefinitionService,
  RlsContextService,
} from "@qs-pro/backend-shared";
import {
  and,
  credentials,
  eq,
  isNotNull,
  type PostgresJsDatabase,
  tenantSettings,
} from "@qs-pro/database";

@Injectable()
export class ShellQuerySweeper {
  private readonly logger = new Logger(ShellQuerySweeper.name);

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
        const err = e as { message?: string };
        this.logger.error(
          `Sweep failed for tenant ${setting.tenantId} MID ${setting.mid}: ${err.message || "Unknown error"}`,
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

      await this.performSweep(tenantId, firstCred.userId, mid, folderId);
    });
  }

  private async performSweep(
    tenantId: string,
    userId: string,
    mid: string,
    folderId: number,
  ): Promise<void> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const queries = await this.queryDefinitionService.retrieveByFolder(
      tenantId,
      userId,
      mid,
      folderId,
      yesterday,
    );

    for (const query of queries) {
      if (!query.objectId) {
        continue;
      }
      try {
        await this.queryDefinitionService.delete(
          tenantId,
          userId,
          mid,
          query.objectId,
        );
        this.logger.log(`Deleted QueryDefinition: ${query.customerKey}`);
      } catch {
        // Asset may already be deleted
      }
    }
  }
}
