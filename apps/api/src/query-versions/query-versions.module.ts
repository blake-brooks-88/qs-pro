import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';

import { CsrfGuard } from '../auth/csrf.guard';
import { FeaturesModule } from '../features/features.module';
import { DrizzleSavedQueriesRepository } from '../saved-queries/drizzle-saved-queries.repository';
import { DrizzleQueryVersionsRepository } from './drizzle-query-versions.repository';
import { QueryVersionsController } from './query-versions.controller';
import { QueryVersionsService } from './query-versions.service';

@Module({
  imports: [DatabaseModule, FeaturesModule],
  controllers: [QueryVersionsController],
  providers: [
    QueryVersionsService,
    CsrfGuard,
    {
      provide: 'QUERY_VERSIONS_REPOSITORY',
      useFactory: (db: unknown) =>
        new DrizzleQueryVersionsRepository(db as never),
      inject: ['DATABASE'],
    },
    {
      provide: 'SAVED_QUERIES_REPOSITORY',
      useFactory: (db: unknown) =>
        new DrizzleSavedQueriesRepository(db as never),
      inject: ['DATABASE'],
    },
  ],
  exports: [QueryVersionsService, 'QUERY_VERSIONS_REPOSITORY'],
})
export class QueryVersionsModule {}
