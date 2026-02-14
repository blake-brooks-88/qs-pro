import { Global, Module } from '@nestjs/common';

import { AUDIT_LOG_REPOSITORY } from './audit.repository';
import { AuditService } from './audit.service';
import { DrizzleAuditLogRepository } from './drizzle-audit-log.repository';

@Global()
@Module({
  providers: [
    {
      provide: AUDIT_LOG_REPOSITORY,
      useFactory: (db: unknown) => new DrizzleAuditLogRepository(db as never),
      inject: ['DATABASE'],
    },
    AuditService,
  ],
  exports: [AuditService],
})
export class AuditModule {}
