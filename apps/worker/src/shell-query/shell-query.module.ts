import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { BullBoardModule } from "@bull-board/nestjs";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule, MceModule } from "@qpp/backend-shared";

import { MceQueryValidator } from "./mce-query-validator";
import { ShellQueryProcessor } from "./shell-query.processor";
import { ShellQuerySweeper } from "./shell-query.sweeper";
import { RunToTempFlow } from "./strategies/run-to-temp.strategy";

@Module({
  imports: [
    BullModule.registerQueue({
      name: "shell-query",
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    }),
    BullBoardModule.forFeature({
      name: "shell-query",
      adapter: BullMQAdapter,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    MceModule,
  ],
  providers: [
    ShellQueryProcessor,
    RunToTempFlow,
    MceQueryValidator,
    ShellQuerySweeper,
  ],
})
export class ShellQueryModule {}
