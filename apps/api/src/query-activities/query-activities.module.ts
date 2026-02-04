import { Module } from '@nestjs/common';
import { MceModule } from '@qpp/backend-shared';

import { CsrfGuard } from '../auth/csrf.guard';
import { FeaturesModule } from '../features/features.module';
import { QueryActivitiesController } from './query-activities.controller';
import { QueryActivitiesService } from './query-activities.service';

@Module({
  imports: [MceModule, FeaturesModule],
  controllers: [QueryActivitiesController],
  providers: [QueryActivitiesService, CsrfGuard],
})
export class QueryActivitiesModule {}
