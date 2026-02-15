import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import {
  DatabaseModule,
  MceModule as SharedMceModule,
  RlsContextService,
} from '@qpp/backend-shared';
import { DrizzleTenantRepository } from '@qpp/database';

import { CsrfGuard } from '../auth/csrf.guard';
import { FeaturesModule } from '../features/features.module';
import { UsageModule } from '../usage/usage.module';
import { DrizzleShellQueryRunRepository } from './drizzle-shell-query-run.repository';
import { RunExistsGuard } from './guards/run-exists.guard';
import { ShellQueryController } from './shell-query.controller';
import { ShellQueryService } from './shell-query.service';
import { ShellQuerySseService } from './shell-query-sse.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'shell-query',
    }),
    DatabaseModule,
    FeaturesModule,
    UsageModule,
    SharedMceModule,
  ],
  controllers: [ShellQueryController],
  providers: [
    ShellQueryService,
    ShellQuerySseService,
    CsrfGuard,
    RunExistsGuard,
    {
      provide: 'TENANT_REPOSITORY',
      useFactory: (db: any) => new DrizzleTenantRepository(db),
      inject: ['DATABASE'],
    },
    {
      provide: 'SHELL_QUERY_RUN_REPOSITORY',
      useFactory: (db: any, rlsContext: RlsContextService) =>
        new DrizzleShellQueryRunRepository(db, rlsContext),
      inject: ['DATABASE', RlsContextService],
    },
  ],
  exports: [ShellQueryService],
})
export class ShellQueryModule {}
