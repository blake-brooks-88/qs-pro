import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';
import { DrizzleUserRepository } from '@qpp/database';

import { CsrfGuard } from '../auth/csrf.guard';
import { FeaturesModule } from '../features/features.module';
import { DrizzleSnippetsRepository } from './drizzle-snippets.repository';
import { SnippetsController } from './snippets.controller';
import { SnippetsService } from './snippets.service';

@Module({
  imports: [DatabaseModule, FeaturesModule],
  controllers: [SnippetsController],
  providers: [
    SnippetsService,
    CsrfGuard,
    {
      provide: 'SNIPPETS_REPOSITORY',
      useFactory: (db: unknown) => new DrizzleSnippetsRepository(db as never),
      inject: ['DATABASE'],
    },
    {
      provide: 'USER_REPOSITORY',
      useFactory: (db: unknown) => new DrizzleUserRepository(db as never),
      inject: ['DATABASE'],
    },
  ],
})
export class SnippetsModule {}
