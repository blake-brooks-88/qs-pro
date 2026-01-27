import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

import {
  getDbFromContext,
  getReservedSqlFromContext,
  runWithDbContext,
} from "./db-context";

@Injectable()
export class RlsContextService {
  private readonly logger = new Logger(RlsContextService.name);

  constructor(
    @Inject("SQL_CLIENT") private readonly sql: Sql,
    @Inject("CREATE_DATABASE_FROM_CLIENT")
    private readonly createDatabaseFromClient: (
      client: Sql,
    ) => PostgresJsDatabase<Record<string, unknown>>,
  ) {}

  private makeDrizzleCompatibleSql(reserved: Sql): Sql {
    // postgres.js `reserve()` returns a Sql tag function without `.options`, but
    // drizzle-orm's postgres-js driver expects `client.options.parsers` to exist.
    // Copy the base client options/parameters onto the reserved Sql tag.
    const reservedWithMeta = reserved as Sql & {
      options: Sql["options"];
      parameters: Sql["parameters"];
    };

    if (!("options" in reservedWithMeta)) {
      Object.defineProperty(reservedWithMeta, "options", {
        value: this.sql.options,
        enumerable: false,
      });
    }

    if (!("parameters" in reservedWithMeta)) {
      Object.defineProperty(reservedWithMeta, "parameters", {
        value: this.sql.parameters,
        enumerable: false,
      });
    }

    return reservedWithMeta;
  }

  async runWithTenantContext<T>(
    tenantId: string,
    mid: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const existing = getDbFromContext();
    if (existing) {
      return fn();
    }

    const reserved = await this.sql.reserve();
    try {
      // Transaction-scoped RLS context: SET LOCAL is automatically cleared on COMMIT/ROLLBACK
      await reserved`BEGIN`;
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await reserved`SELECT set_config('app.mid', ${mid}, true)`;

      const db = this.createDatabaseFromClient(
        this.makeDrizzleCompatibleSql(reserved),
      );

      const result = await runWithDbContext(db, fn, reserved);

      await reserved`COMMIT`;
      return result;
    } catch (error) {
      try {
        await reserved`ROLLBACK`;
      } catch {
        // Best-effort rollback
      }
      this.logger.error(
        "Failed to run with tenant context",
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    } finally {
      reserved.release();
    }
  }

  async runWithUserContext<T>(
    tenantId: string,
    mid: string,
    userId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const existing = getDbFromContext();
    const existingReservedSql = getReservedSqlFromContext();

    if (existing && existingReservedSql) {
      // Reuse the existing reserved connection within the same transaction.
      // set_config with true (local) applies to current transaction only.
      await existingReservedSql`SELECT set_config('app.user_id', ${userId}, true)`;
      return fn();
    }

    const reserved = await this.sql.reserve();
    try {
      // Transaction-scoped RLS context: SET LOCAL is automatically cleared on COMMIT/ROLLBACK
      await reserved`BEGIN`;
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await reserved`SELECT set_config('app.mid', ${mid}, true)`;
      await reserved`SELECT set_config('app.user_id', ${userId}, true)`;

      const db = this.createDatabaseFromClient(
        this.makeDrizzleCompatibleSql(reserved),
      );

      const result = await runWithDbContext(db, fn, reserved);

      await reserved`COMMIT`;
      return result;
    } catch (error) {
      try {
        await reserved`ROLLBACK`;
      } catch {
        // Best-effort rollback
      }
      this.logger.error(
        "Failed to run with user context",
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    } finally {
      reserved.release();
    }
  }
}
