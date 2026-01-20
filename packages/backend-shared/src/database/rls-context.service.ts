import { Inject, Injectable, Logger } from "@nestjs/common";
import { createDatabaseFromClient } from "@qpp/database";
import type { Sql } from "postgres";

import {
  getDbFromContext,
  getReservedSqlFromContext,
  runWithDbContext,
} from "./db-context";

@Injectable()
export class RlsContextService {
  private readonly logger = new Logger(RlsContextService.name);

  constructor(@Inject("SQL_CLIENT") private readonly sql: Sql) {}

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
      // Postgres does not allow bind parameters in `SET ... = ...`; use set_config instead.
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${mid}, false)`;

      const db = createDatabaseFromClient(
        this.makeDrizzleCompatibleSql(reserved),
      );

      return await runWithDbContext(db, fn, reserved);
    } catch (error) {
      this.logger.error(
        "Failed to run with tenant context",
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    } finally {
      try {
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
      } catch {
        // Best-effort cleanup; connection is released regardless.
      }
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
      // Reuse the existing reserved connection to ensure set_config applies to queries.
      await existingReservedSql`SELECT set_config('app.user_id', ${userId}, false)`;
      try {
        return await fn();
      } finally {
        try {
          await existingReservedSql`RESET app.user_id`;
        } catch {
          // Best-effort cleanup
        }
      }
    }

    const reserved = await this.sql.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${mid}, false)`;
      await reserved`SELECT set_config('app.user_id', ${userId}, false)`;

      const db = createDatabaseFromClient(
        this.makeDrizzleCompatibleSql(reserved),
      );

      return await runWithDbContext(db, fn, reserved);
    } catch (error) {
      this.logger.error(
        "Failed to run with user context",
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    } finally {
      try {
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
      } catch {
        // Best-effort cleanup
      }
      reserved.release();
    }
  }
}
