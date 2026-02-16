import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";

import { BullMQHealthIndicator } from "./bullmq.health";
import { HealthController } from "./health.controller";
import { PostgresHealthIndicator } from "./postgres.health";
import { RedisHealthIndicator } from "./redis.health";

@Module({
  imports: [
    TerminusModule,
    BullModule.registerQueue({
      name: "shell-query",
    }),
  ],
  controllers: [HealthController],
  providers: [
    PostgresHealthIndicator,
    RedisHealthIndicator,
    BullMQHealthIndicator,
  ],
})
export class HealthModule {}
