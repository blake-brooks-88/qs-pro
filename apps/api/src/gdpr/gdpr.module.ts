import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';
import { DrizzleUserRepository } from '@qpp/database';

import { StripeProvider } from '../billing/stripe.provider';
import { AuditAnonymizationService } from './audit-anonymization.service';
import { BullmqCleanupService } from './bullmq-cleanup.service';
import { RedisCleanupService } from './redis-cleanup.service';
import { TenantDeletionService } from './tenant-deletion.service';
import { UserDeletionService } from './user-deletion.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    StripeProvider,
    AuditAnonymizationService,
    TenantDeletionService,
    RedisCleanupService,
    BullmqCleanupService,
    UserDeletionService,
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
