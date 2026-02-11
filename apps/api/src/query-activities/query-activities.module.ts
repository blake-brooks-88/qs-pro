import { Module } from '@nestjs/common';
import { DatabaseModule, MceModule } from '@qpp/backend-shared';

import { CsrfGuard } from '../auth/csrf.guard';
import { FeaturesModule } from '../features/features.module';
import { SavedQueriesModule } from '../saved-queries/saved-queries.module';
import { DrizzleQueryPublishEventsRepository } from './drizzle-query-publish-events.repository';
import { QueryActivitiesController } from './query-activities.controller';
import { QueryActivitiesService } from './query-activities.service';

@Module({
  imports: [MceModule, DatabaseModule, FeaturesModule, SavedQueriesModule],
  controllers: [QueryActivitiesController],
  providers: [
    QueryActivitiesService,
    CsrfGuard,
    {
      provide: 'QUERY_PUBLISH_EVENT_REPOSITORY',
      useFactory: (db: unknown) =>
        new DrizzleQueryPublishEventsRepository(db as never),
      inject: ['DATABASE'],
    },
  ],
  exports: [QueryActivitiesService],
})
export class QueryActivitiesModule {}
