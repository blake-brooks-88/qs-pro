import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Inject('DATABASE')
    private readonly db: PostgresJsDatabase<Record<string, never>>,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/health')
  async getHealth() {
    const result: { status: string; timestamp: string; db: string } = {
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
