import { Global, Module, OnModuleInit } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  register,
} from 'prom-client';

import { MetricsController } from './metrics.controller';

function getOrCreateCounter(
  name: string,
  help: string,
  labelNames: string[],
): Counter {
  return (
    (register.getSingleMetric(name) as Counter) ??
    new Counter({ name, help, labelNames })
  );
}

function getOrCreateHistogram(
  name: string,
  help: string,
  buckets: number[],
): Histogram {
  return (
    (register.getSingleMetric(name) as Histogram) ??
    new Histogram({ name, help, buckets })
  );
}

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: 'QPP_QUERIES_EXECUTED',
      useFactory: () =>
        getOrCreateCounter(
          'qpp_queries_executed_total',
          'Total queries executed via API',
          ['status', 'tier'],
        ),
    },
    {
      provide: 'QPP_MCE_API_CALLS',
      useFactory: () =>
        getOrCreateCounter(
          'qpp_mce_api_calls_total',
          'Total MCE API calls made',
          ['operation', 'status'],
        ),
    },
    {
      provide: 'QPP_QUERY_DURATION',
      useFactory: () =>
        getOrCreateHistogram(
          'qpp_query_duration_seconds',
          'End-to-end query execution duration',
          [0.1, 0.5, 1, 5, 10, 30, 60, 300],
        ),
    },
  ],
  exports: ['QPP_QUERIES_EXECUTED', 'QPP_MCE_API_CALLS', 'QPP_QUERY_DURATION'],
})
export class MetricsModule implements OnModuleInit {
  onModuleInit() {
    collectDefaultMetrics({ prefix: 'qpp_' });
  }
}
