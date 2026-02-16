import { register } from 'prom-client';
import { afterEach, describe, expect, it } from 'vitest';

import { MetricsModule } from '../metrics.module';

describe('MetricsModule', () => {
  afterEach(() => {
    register.clear();
  });

  describe('onModuleInit()', () => {
    it('calls collectDefaultMetrics with qpp_ prefix', () => {
      const module = new MetricsModule();

      module.onModuleInit();

      const metric = register.getSingleMetric(
        'qpp_process_cpu_user_seconds_total',
      );
      expect(metric).toBeDefined();
    });

    it('does not double-register default metrics on repeated calls', () => {
      const module = new MetricsModule();

      module.onModuleInit();
      module.onModuleInit();

      const metrics = register.getMetricsAsArray();
      const cpuMetrics = metrics.filter(
        (m) => m.name === 'qpp_process_cpu_user_seconds_total',
      );
      expect(cpuMetrics).toHaveLength(1);
    });
  });
});
