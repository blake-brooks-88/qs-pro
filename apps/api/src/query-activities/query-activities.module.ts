import { Module } from '@nestjs/common';
import { MceModule } from '@qpp/backend-shared';

import { CsrfGuard } from '../auth/csrf.guard';
import { FeaturesModule } from '../features/features.module';
import { SavedQueriesModule } from '../saved-queries/saved-queries.module';
import { QueryActivitiesController } from './query-activities.controller';
import { QueryActivitiesService } from './query-activities.service';

@Module({
  imports: [MceModule, FeaturesModule, SavedQueriesModule],
  controllers: [QueryActivitiesController],
  providers: [QueryActivitiesService, CsrfGuard],
  exports: [QueryActivitiesService],
})
export class QueryActivitiesModule {}
