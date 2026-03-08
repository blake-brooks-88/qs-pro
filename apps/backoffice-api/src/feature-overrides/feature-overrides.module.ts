import { Module } from '@nestjs/common';

import { BackofficeAuditService } from '../audit/audit.service.js';
import { FeatureOverridesController } from './feature-overrides.controller.js';
import { FeatureOverridesService } from './feature-overrides.service.js';

@Module({
  controllers: [FeatureOverridesController],
  providers: [
    FeatureOverridesService,
    { provide: 'BackofficeAuditService', useClass: BackofficeAuditService },
  ],
  exports: [FeatureOverridesService],
})
export class FeatureOverridesModule {}
