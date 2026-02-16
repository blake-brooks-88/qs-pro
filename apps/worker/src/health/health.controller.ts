import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";

import { BullMQHealthIndicator } from "./bullmq.health";
import { PostgresHealthIndicator } from "./postgres.health";
import { RedisHealthIndicator } from "./redis.health";

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgres: PostgresHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly bullmq: BullMQHealthIndicator,
  ) {}

  @Get("livez")
  @HealthCheck()
  livez() {
    return this.health.check([]);
  }

  @Get("readyz")
  @HealthCheck()
  readyz() {
    return this.health.check([
      () => this.postgres.isHealthy("postgres"),
      () => this.redis.isHealthy("redis"),
      () => this.bullmq.isHealthy("bullmq"),
    ]);
  }
}
