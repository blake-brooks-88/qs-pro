import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';
import { DrizzleOrgSubscriptionRepository } from '@qpp/database';

import { TrialService } from './trial.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    TrialService,
    {
      provide: 'ORG_SUBSCRIPTION_REPOSITORY',
      useFactory: (db: any) => new DrizzleOrgSubscriptionRepository(db),
      inject: ['DATABASE'],
    },
  ],
  exports: [TrialService],
})
export class TrialModule {}
