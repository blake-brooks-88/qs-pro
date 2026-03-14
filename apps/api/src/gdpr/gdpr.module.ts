import { Module } from '@nestjs/common';
import { DatabaseModule, EncryptionModule } from '@qpp/backend-shared';
import { DrizzleUserRepository } from '@qpp/database';

import { RolesGuard } from '../admin/roles.guard';
import { StripeProvider } from '../billing/stripe.provider';
import { AuditAnonymizationService } from './audit-anonymization.service';
import { BullmqCleanupService } from './bullmq-cleanup.service';
import { DataExportService } from './data-export.service';
import { GdprController } from './gdpr.controller';
import { RedisCleanupService } from './redis-cleanup.service';
import { TenantDeletionService } from './tenant-deletion.service';
import { UserDeletionService } from './user-deletion.service';

@Module({
  imports: [DatabaseModule, EncryptionModule],
  controllers: [GdprController],
  providers: [
    StripeProvider,
    RolesGuard,
    AuditAnonymizationService,
    TenantDeletionService,
    RedisCleanupService,
    BullmqCleanupService,
    UserDeletionService,
    DataExportService,
    {
      provide: 'USER_REPOSITORY',
      useFactory: (db: unknown) => new DrizzleUserRepository(db as never),
      inject: ['DATABASE'],
    },
  ],
  exports: [
    TenantDeletionService,
    UserDeletionService,
    AuditAnonymizationService,
  ],
})
export class GdprModule {}
