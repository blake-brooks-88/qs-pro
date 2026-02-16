import { Inject, Injectable } from '@nestjs/common';
import {
  type HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

@Injectable()
export class PostgresHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject('DATABASE')
    private readonly db: PostgresJsDatabase<Record<string, never>>,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await Promise.race([
        this.db.execute(sql`SELECT 1`),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Postgres health check timeout')),
            500,
          ),
        ),
      ]);
      return indicator.up();
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
