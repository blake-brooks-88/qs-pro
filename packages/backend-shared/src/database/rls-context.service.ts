import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

import {
  getDbFromContext,
  getReservedSqlFromContext,
  runWithDbContext,
} from "./db-context";
import { triggerFailClosedExit } from "./fail-closed-exit";

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
    return this.runWithTenantContextInternal(tenantId, mid, fn, false);
  }

  async runWithIsolatedTenantContext<T>(
    tenantId: string,
    mid: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.runWithTenantContextInternal(tenantId, mid, fn, true);
  }

  private async runWithTenantContextInternal<T>(
    tenantId: string,
    mid: string,
    fn: () => Promise<T>,
    isolated: boolean,
  ): Promise<T> {
    const existing = getDbFromContext();
    if (existing && !isolated) {
      return fn();
    }

    const reserveStartedAt = Date.now();
    const reserved = await this.sql.reserve();
    const reserveDuration = Date.now() - reserveStartedAt;
    if (reserveDuration > 500) {
      this.logger.warn(
        `runWithTenantContext reserve wait was slow durationMs=${reserveDuration}`,
      );
    }
    let rollbackFailed = false;
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
      } catch (rollbackError) {
        rollbackFailed = true;
        this.logger.warn(
          "Failed to rollback transaction in runWithTenantContext",
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
        );
      }
      this.logger.error(
        "Failed to run with tenant context",
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    } finally {
      try {
        await reserved`RESET app.user_id`;
      } catch (resetError) {
        this.logger.warn(
          "Failed to reset app.user_id before releasing connection",
          resetError instanceof Error ? resetError.message : String(resetError),
        );
      }
      if (rollbackFailed && process.env.NODE_ENV === "production") {
        // SECURITY: Do NOT release — connection may be in indeterminate transaction state.
        // Fail closed: destroy pool connections and exit immediately.
        triggerFailClosedExit(this.sql);
      } else {
        reserved.release();
      }
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
      // Reuse the existing reserved connection (from the onRequest hook).
      // The hook's connection has no active transaction, so is_local=false
      // (session-scoped) is required for the setting to persist across statements.
      await existingReservedSql`SELECT set_config('app.user_id', ${userId}, false)`;
      return fn();
    }

    const reserveStartedAt = Date.now();
    const reserved = await this.sql.reserve();
    const reserveDuration = Date.now() - reserveStartedAt;
    if (reserveDuration > 500) {
      this.logger.warn(
        `runWithUserContext reserve wait was slow durationMs=${reserveDuration}`,
      );
    }
    let rollbackFailed = false;
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
      } catch (rollbackError) {
        rollbackFailed = true;
        this.logger.warn(
          "Failed to rollback transaction in runWithUserContext",
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
        );
      }
      this.logger.error(
        "Failed to run with user context",
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    } finally {
      try {
        await reserved`RESET app.user_id`;
      } catch (resetError) {
        this.logger.warn(
          "Failed to reset app.user_id before releasing connection",
          resetError instanceof Error ? resetError.message : String(resetError),
        );
      }
      if (rollbackFailed && process.env.NODE_ENV === "production") {
        // SECURITY: Do NOT release — connection may be in indeterminate transaction state.
        // Fail closed: destroy pool connections and exit immediately.
        triggerFailClosedExit(this.sql);
      } else {
        reserved.release();
      }
    }
  }

  /**
   * Runs the callback inside a dedicated transaction, even if a DB context
   * already exists (e.g. when the HTTP onRequest hook has reserved a connection
   * without an active transaction).
   *
   * Use this for multi-statement operations that must be atomic.
   */
  async runWithIsolatedUserContext<T>(
    tenantId: string,
    mid: string,
    userId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const reserveStartedAt = Date.now();
    const reserved = await this.sql.reserve();
    const reserveDuration = Date.now() - reserveStartedAt;
    if (reserveDuration > 500) {
      this.logger.warn(
        `runWithIsolatedUserContext reserve wait was slow durationMs=${reserveDuration}`,
      );
    }

    let rollbackFailed = false;
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
      } catch (rollbackError) {
        rollbackFailed = true;
        this.logger.warn(
          "Failed to rollback transaction in runWithIsolatedUserContext",
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
        );
      }
      this.logger.error(
        "Failed to run with isolated user context",
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    } finally {
      try {
        await reserved`RESET app.user_id`;
      } catch (resetError) {
        this.logger.warn(
          "Failed to reset app.user_id before releasing connection",
          resetError instanceof Error ? resetError.message : String(resetError),
        );
      }
      if (rollbackFailed && process.env.NODE_ENV === "production") {
        // SECURITY: Do NOT release — connection may be in indeterminate transaction state.
        // Fail closed: destroy pool connections and exit immediately.
        triggerFailClosedExit(this.sql);
      } else {
        reserved.release();
      }
    }
  }
}
