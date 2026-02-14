import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { FeaturesModule } from '../features/features.module';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { AUDIT_LOG_REPOSITORY } from './audit.repository';
import { AuditService } from './audit.service';
import { DrizzleAuditLogRepository } from './drizzle-audit-log.repository';

@Global()
@Module({
  imports: [FeaturesModule],
  controllers: [AuditController],
  providers: [
    {
      provide: AUDIT_LOG_REPOSITORY,
      useFactory: (db: unknown) => new DrizzleAuditLogRepository(db as never),
      inject: ['DATABASE'],
    },
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
