import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';

import { createContextAwareOrgSubscriptionRepository } from '../billing/context-aware-org-subscription.repository';
import { TrialService } from './trial.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    TrialService,
    {
      provide: 'ORG_SUBSCRIPTION_REPOSITORY',
      useFactory: (db: any) => createContextAwareOrgSubscriptionRepository(db),
      inject: ['DATABASE'],
    },
  ],
  exports: [TrialService],
})
export class TrialModule {}
