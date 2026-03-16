import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { BullBoardModule } from "@bull-board/nestjs";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "@qpp/backend-shared";
import {
  DrizzleSiemWebhookConfigRepository,
  type PostgresJsDatabase,
} from "@qpp/database";

import { SIEM_WEBHOOK_CONFIG_REPOSITORY } from "./siem.constants";
import { SiemWebhookProcessor } from "./siem-webhook.processor";

@Module({
  imports: [
    BullModule.registerQueue({
      name: "siem-webhook",
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      },
    }),
    BullBoardModule.forFeature({
      name: "siem-webhook",
      adapter: BullMQAdapter,
    }),
    DatabaseModule,
  ],
  providers: [
    {
      provide: SIEM_WEBHOOK_CONFIG_REPOSITORY,
      useFactory: (db: PostgresJsDatabase) =>
        new DrizzleSiemWebhookConfigRepository(db),
      inject: ["DATABASE"],
    },
    SiemWebhookProcessor,
  ],
})
export class SiemModule {}
