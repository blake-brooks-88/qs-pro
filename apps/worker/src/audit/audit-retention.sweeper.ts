import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { type PostgresJsDatabase, sql, tenants } from "@qpp/database";

@Injectable()
export class AuditRetentionSweeper implements OnModuleInit {
  private readonly logger = new Logger(AuditRetentionSweeper.name);

  constructor(
    @Inject("DATABASE")
    private readonly db: PostgresJsDatabase<Record<string, never>>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.handlePartitionCreation();
  }

  // TODO(Phase 14): system.retention_purge audit event — requires admin context for RLS bypass
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleRetentionPurge(): Promise<void> {
    this.logger.log("Starting nightly audit retention purge...");

    try {
      const retentionRows = await this.db.execute(
        sql`SELECT MAX(COALESCE(${tenants.auditRetentionDays}, 365)) as max_retention FROM ${tenants}`,
      );

      const maxRetention = Number(retentionRows[0]?.["max_retention"]) || 365;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxRetention);
      const oldestAllowedYear = cutoffDate.getFullYear();
      const oldestAllowedMonth = cutoffDate.getMonth() + 1;

      const partitions = await this.db.execute(sql`
        SELECT c.relname
        FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        JOIN pg_class p ON p.oid = i.inhparent
        WHERE p.relname = 'audit_logs'
          AND c.relname != 'audit_logs_default'
      `);

      let droppedCount = 0;

      for (const partition of partitions) {
        const relname = String(partition["relname"]);
        const match = relname.match(/^audit_logs_y(\d{4})m(\d{2})$/);
        if (!match?.[1] || !match[2]) {
          continue;
        }

        const partYear = parseInt(match[1], 10);
        const partMonth = parseInt(match[2], 10);

        const isExpired =
          partYear < oldestAllowedYear ||
          (partYear === oldestAllowedYear && partMonth < oldestAllowedMonth);

        if (!isExpired) {
          continue;
        }

        try {
          await this.db.execute(
            sql.raw(`ALTER TABLE "audit_logs" DETACH PARTITION "${relname}"`),
          );
          await this.db.execute(sql.raw(`DROP TABLE "${relname}"`));

          this.logger.log(`Dropped expired partition: ${relname}`);
          droppedCount++;
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          this.logger.error(`Failed to drop partition ${relname}: ${message}`);
        }
      }

      this.logger.log(
        `Audit retention purge completed. Dropped ${droppedCount} partition(s).`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Audit retention purge failed: ${message}`);
    }
  }

  @Cron("0 0 25 * *")
  async handlePartitionCreation(): Promise<void> {
    this.logger.log("Starting monthly audit partition pre-creation...");

    const now = new Date();
    const monthsToCreate = this.getNextMonths(now, 3);

    for (const { name, start, end } of monthsToCreate) {
      try {
        await this.db.execute(
          sql.raw(
            `CREATE TABLE IF NOT EXISTS "${name}" PARTITION OF "audit_logs" FOR VALUES FROM ('${start}') TO ('${end}')`,
          ),
        );

        this.logger.log(`Pre-created partition: ${name}`);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        this.logger.error(`Failed to create partition ${name}: ${message}`);
      }
    }

    this.logger.log("Audit partition pre-creation completed.");
  }

  private getNextMonths(
    from: Date,
    count: number,
  ): Array<{ name: string; start: string; end: string }> {
    const results: Array<{ name: string; start: string; end: string }> = [];
    let year = from.getFullYear();
    let month = from.getMonth() + 1;

    for (let i = 0; i < count; i++) {
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;

      const name = `audit_logs_y${year}m${String(month).padStart(2, "0")}`;
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

      results.push({ name, start, end });

      month = nextMonth;
      year = nextYear;
    }

    return results;
  }
}
