import { Module } from '@nestjs/common';
import { DatabaseModule, RlsContextService } from '@qpp/backend-shared';

import { FeaturesModule } from '../features/features.module';
import { SavedQueriesModule } from '../saved-queries/saved-queries.module';
import { DrizzleShellQueryRunRepository } from '../shell-query/drizzle-shell-query-run.repository';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
  imports: [DatabaseModule, FeaturesModule, SavedQueriesModule],
  controllers: [UsageController],
  providers: [
    UsageService,
    {
      provide: 'SHELL_QUERY_RUN_REPOSITORY',
      useFactory: (db: any, rlsContext: RlsContextService) =>
        new DrizzleShellQueryRunRepository(db, rlsContext),
      inject: ['DATABASE', RlsContextService],
    },
  ],
  exports: [UsageService],
})
export class UsageModule {}
