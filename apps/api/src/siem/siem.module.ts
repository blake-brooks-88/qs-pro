import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EncryptionModule } from '@qpp/backend-shared';
import { DrizzleSiemWebhookConfigRepository } from '@qpp/database';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { AdminModule } from '../admin/admin.module';
import { FeaturesModule } from '../features/features.module';
import { SiemController } from './siem.controller';
import { SIEM_WEBHOOK_CONFIG_REPOSITORY } from './siem.repository';
import { SiemService } from './siem.service';
import { SiemWebhookProducer } from './siem-webhook.producer';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'siem-webhook' }),
    EncryptionModule,
    FeaturesModule,
    AdminModule,
  ],
  controllers: [SiemController],
  providers: [
    {
      provide: SIEM_WEBHOOK_CONFIG_REPOSITORY,
      useFactory: (db: PostgresJsDatabase) =>
        new DrizzleSiemWebhookConfigRepository(db),
      inject: ['DATABASE'],
    },
    SiemService,
    SiemWebhookProducer,
  ],
  exports: [SiemService, SiemWebhookProducer, SIEM_WEBHOOK_CONFIG_REPOSITORY],
})
export class SiemModule {}
