import { Inject, Injectable } from "@nestjs/common";
import {
  type HealthIndicatorResult,
  HealthIndicatorService,
} from "@nestjs/terminus";
import type { Sql } from "postgres";

@Injectable()
export class PostgresHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject("SQL_CLIENT") private readonly sql: Sql,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await Promise.race([
        this.sql`SELECT 1`,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Postgres health check timeout")),
            500,
          ),
        ),
      ]);
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message:
          process.env.NODE_ENV === "production"
            ? "Unhealthy"
            : error instanceof Error
              ? error.message
              : "Unknown error",
      });
    }
  }
}
