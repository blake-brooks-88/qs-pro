import { Global, Module, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram } from 'prom-client';

import { MetricsController } from './metrics.controller';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: 'QPP_QUERIES_EXECUTED',
      useFactory: () =>
        new Counter({
          name: 'qpp_queries_executed_total',
          help: 'Total queries executed via API',
          labelNames: ['status', 'tier'],
        }),
    },
    {
      provide: 'QPP_MCE_API_CALLS',
      useFactory: () =>
        new Counter({
          name: 'qpp_mce_api_calls_total',
          help: 'Total MCE API calls made',
          labelNames: ['operation', 'status'],
        }),
    },
    {
      provide: 'QPP_QUERY_DURATION',
      useFactory: () =>
        new Histogram({
          name: 'qpp_query_duration_seconds',
          help: 'End-to-end query execution duration',
          buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
        }),
    },
  ],
  exports: ['QPP_QUERIES_EXECUTED', 'QPP_MCE_API_CALLS', 'QPP_QUERY_DURATION'],
})
export class MetricsModule implements OnModuleInit {
  onModuleInit() {
    collectDefaultMetrics({ prefix: 'qpp_' });
  }
}
