import { Module } from '@nestjs/common';

import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [HealthModule, MetricsModule],
})
export class ObservabilityModule {}
