import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';
import {
  DrizzleFeatureOverrideRepository,
  DrizzleTenantRepository,
} from '@qpp/database';

import { FeaturesController } from './features.controller';
import { FeaturesService } from './features.service';

@Module({
  imports: [DatabaseModule],
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
  ],
  exports: [FeaturesService],
})
export class FeaturesModule {}
