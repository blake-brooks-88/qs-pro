import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';
import {
  DrizzleFeatureOverrideRepository,
  DrizzleOrgSubscriptionRepository,
  DrizzleTenantRepository,
} from '@qpp/database';

import { TrialModule } from '../trial/trial.module';
import { FeaturesController } from './features.controller';
import { FeaturesService } from './features.service';

@Module({
  imports: [DatabaseModule, TrialModule],
  controllers: [FeaturesController],
  providers: [
    FeaturesService,
    {
      provide: 'FEATURE_OVERRIDE_REPOSITORY',
      useFactory: (db: any) => new DrizzleFeatureOverrideRepository(db),
      inject: ['DATABASE'],
    },
    {
      provide: 'TENANT_REPOSITORY',
      useFactory: (db: any) => new DrizzleTenantRepository(db),
      inject: ['DATABASE'],
    },
    {
      provide: 'ORG_SUBSCRIPTION_REPOSITORY',
      useFactory: (db: any) => new DrizzleOrgSubscriptionRepository(db),
      inject: ['DATABASE'],
    },
  ],
  exports: [FeaturesService],
})
export class FeaturesModule {}
