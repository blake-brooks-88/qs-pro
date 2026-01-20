import { Inject, Injectable, NestMiddleware } from "@nestjs/common";
import { createDatabaseFromClient, createSqlClient } from "@qpp/database";
import type { FastifyReply, FastifyRequest } from "fastify";

import { getDbFromContext, runWithDbContext } from "./db-context";

type SecureSession = {
  get(key: string): unknown;
};

type SqlClient = ReturnType<typeof createSqlClient>;

@Injectable()
export class RlsContextMiddleware implements NestMiddleware {
  constructor(@Inject("SQL_CLIENT") private readonly sql: SqlClient) {}

  private makeDrizzleCompatibleSql(reserved: SqlClient): SqlClient {
    // postgres.js `reserve()` returns a Sql tag function without `.options`, but
    // drizzle-orm's postgres-js driver expects `client.options.parsers` to exist.
    // Copy the base client options/parameters onto the reserved Sql tag.
    if (!reserved || typeof reserved !== "function") {
      return reserved;
    }

    if (!("options" in reserved)) {
      Object.defineProperty(reserved, "options", {
        value: this.sql?.options,
        enumerable: false,
      });
    }

    if (!("parameters" in reserved)) {
      Object.defineProperty(reserved, "parameters", {
        value: this.sql?.parameters,
        enumerable: false,
      });
    }

    return reserved;
  }

  use(
    req: FastifyRequest & { session?: SecureSession },
    res: FastifyReply,
    next: () => void,
  ) {
    if (getDbFromContext()) {
      next();
      return;
    }

    const tenantId = req.session?.get("tenantId");
    const mid = req.session?.get("mid");

    if (typeof tenantId !== "string" || typeof mid !== "string") {
      next();
      return;
    }

    void this.attachContext(res, tenantId, mid, next);
  }

  private async attachContext(
    res: FastifyReply,
    tenantId: string,
    mid: string,
    next: () => void,
  ) {
    const reserved = await this.sql.reserve();
    try {
      // Postgres does not allow bind parameters in `SET ... = ...`; use set_config instead.
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${mid}, false)`;
    } catch (error) {
      await reserved.release();
      throw error;
    }

    let released = false;
    const cleanup = async () => {
      if (released) {
        return;
      }
      released = true;
      try {
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
      } catch {
        // ignore
      }
      await reserved.release();
    };

    res.raw.once("finish", () => void cleanup());
    res.raw.once("close", () => void cleanup());
    res.raw.once("error", () => void cleanup());

    const compatibleSql = this.makeDrizzleCompatibleSql(
      reserved as unknown as SqlClient,
    );
    const db = createDatabaseFromClient(compatibleSql);
    runWithDbContext(db, next, compatibleSql);
  }
}
