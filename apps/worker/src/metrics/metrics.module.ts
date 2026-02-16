import { Global, Module } from "@nestjs/common";
import { Counter, Gauge, Histogram, register } from "prom-client";

import { MetricsController } from "./metrics.controller";

function getOrCreateCounter(
  name: string,
  help: string,
  labelNames: string[] = [],
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

function getOrCreateGauge(name: string, help: string): Gauge {
  return (
    (register.getSingleMetric(name) as Gauge) ?? new Gauge({ name, help })
  );
}

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: "METRICS_JOBS_TOTAL",
      useFactory: () =>
        getOrCreateCounter(
          "shell_query_jobs_total",
          "Total number of shell query jobs",
          ["status"],
        ),
    },
    {
      provide: "METRICS_DURATION",
      useFactory: () =>
        getOrCreateHistogram(
          "shell_query_duration_seconds",
          "Duration of shell query jobs in seconds",
          [1, 5, 10, 30, 60, 300, 600, 1800],
        ),
    },
    {
      provide: "METRICS_FAILURES_TOTAL",
      useFactory: () =>
        getOrCreateCounter(
          "shell_query_failures_total",
          "Total number of failed shell query jobs",
          ["error_type"],
        ),
    },
    {
      provide: "METRICS_ACTIVE_JOBS",
      useFactory: () =>
        getOrCreateGauge(
          "shell_query_active_jobs",
          "Number of active shell query jobs",
        ),
    },
  ],
  exports: [
    "METRICS_JOBS_TOTAL",
    "METRICS_DURATION",
    "METRICS_FAILURES_TOTAL",
    "METRICS_ACTIVE_JOBS",
  ],
})
export class MetricsModule {}
