import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ShellQueryService } from './shell-query.service';
import { ShellQueryController } from './shell-query.controller';
import { DatabaseModule } from '../database/database.module';
import { MceModule } from '../mce/mce.module';
import { DrizzleTenantRepository } from '@qs-pro/database';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'shell-query',
    }),
    DatabaseModule,
    MceModule,
  ],
  controllers: [ShellQueryController],
  providers: [
    ShellQueryService,
    {
      provide: 'TENANT_REPOSITORY',
      useFactory: (db: any) => new DrizzleTenantRepository(db),
      inject: ['DATABASE'],
    },
  ],
  exports: [ShellQueryService],
})
export class ShellQueryModule {}
