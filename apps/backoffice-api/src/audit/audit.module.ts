import { Global, Module } from '@nestjs/common';

import { BackofficeAuditService } from './audit.service.js';

@Global()
@Module({
  providers: [BackofficeAuditService],
  exports: [BackofficeAuditService],
})
export class AuditModule {}
