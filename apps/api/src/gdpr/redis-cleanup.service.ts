import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from '@qpp/database';
import { users } from '@qpp/database';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type Redis from 'ioredis';

@Injectable()
export class RedisCleanupService {
  private readonly logger = new Logger(RedisCleanupService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject('DATABASE') private readonly db: PostgresJsDatabase,
  ) {}

  async purgeForTenant(tenantId: string): Promise<void> {
    const tenantUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tenantId, tenantId));

    const keys: string[] = [];

    for (const user of tenantUsers) {
      keys.push(`sse-limit:${user.id}`);
      keys.push(user.id); // throttler rate-limit key
    }

    if (keys.length === 0) {
      this.logger.log(`No Redis keys to purge for tenant ${tenantId}`);
      return;
    }

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.del(key);
    }
    await pipeline.exec();

    this.logger.log(`Purged ${keys.length} Redis keys for tenant ${tenantId}`);
  }
}
