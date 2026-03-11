import { Controller, Get, Inject, Res } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { FastifyReply } from "fastify";

import { Public } from "../common/decorators/public.decorator.js";
import { DRIZZLE_DB } from "../database/database.module.js";

@Controller("health")
@Public()
export class HealthController {
  constructor(@Inject(DRIZZLE_DB) private readonly db: PostgresJsDatabase) {}

  @Get()
  async check(@Res() reply: FastifyReply) {
    try {
      await this.db.execute(sql`SELECT 1`);
      return reply.status(200).send({
        status: "ok",
        timestamp: new Date().toISOString(),
      });
    } catch {
      return reply.status(503).send({ status: "error" });
    }
  }
}
