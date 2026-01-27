import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

@Injectable()
export class AppService {
  constructor(
    @Inject('DATABASE')
    private readonly db: PostgresJsDatabase<Record<string, never>>,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async checkDatabaseHealth(): Promise<{
    status: string;
    timestamp: string;
    db: string;
  }> {
    const result = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: 'unknown',
    };

    try {
      await this.db.execute(sql`SELECT 1`);
      result.db = 'up';
    } catch {
      result.db = 'down';
      result.status = 'degraded';
    }

    return result;
  }
}
