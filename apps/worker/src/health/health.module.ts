import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "@qpp/backend-shared";

import { HealthController } from "./health.controller";

@Module({
  imports: [
    BullModule.registerQueue({
      name: "shell-query",
    }),
    DatabaseModule,
  ],
  controllers: [HealthController],
})
export class HealthModule {}
