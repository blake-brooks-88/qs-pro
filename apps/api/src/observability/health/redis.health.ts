import { Inject, Injectable } from '@nestjs/common';
import {
  type HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import type Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const response = await Promise.race([
        this.redis.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis health check timeout')),
            500,
          ),
        ),
      ]);
      if (response === 'PONG') {
        return indicator.up();
      }
      return indicator.down({
        message:
          process.env.NODE_ENV === 'production'
            ? 'Unhealthy'
            : `Unexpected response: ${String(response)}`,
      });
    } catch (error) {
      return indicator.down({
        message:
          process.env.NODE_ENV === 'production'
            ? 'Unhealthy'
            : error instanceof Error
              ? error.message
              : 'Unknown error',
      });
    }
  }
}
