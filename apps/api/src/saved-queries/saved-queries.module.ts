import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';

import { CsrfGuard } from '../auth/csrf.guard';
import { FoldersModule } from '../folders/folders.module';
import { DrizzleSavedQueriesRepository } from './drizzle-saved-queries.repository';
import { SavedQueriesController } from './saved-queries.controller';
import { SavedQueriesService } from './saved-queries.service';

@Module({
  imports: [DatabaseModule, FoldersModule],
  controllers: [SavedQueriesController],
  providers: [
    SavedQueriesService,
    CsrfGuard,
    {
      provide: 'SAVED_QUERIES_REPOSITORY',
      useFactory: (db: unknown) =>
        new DrizzleSavedQueriesRepository(db as never),
      inject: ['DATABASE'],
    },
  ],
  exports: [SavedQueriesService, 'SAVED_QUERIES_REPOSITORY'],
})
export class SavedQueriesModule {}
