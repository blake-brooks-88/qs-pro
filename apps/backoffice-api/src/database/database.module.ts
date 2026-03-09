import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  assertSafeBackofficeDatabaseRole,
  assertSafeBackofficeDatabaseUrl,
} from '@qpp/backend-shared';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export const DRIZZLE_DB = Symbol('DRIZZLE_DB');

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DB,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const url = config.getOrThrow<string>('DATABASE_URL_BACKOFFICE');
        assertSafeBackofficeDatabaseUrl(url);
        const client = postgres(url, {
          max: parseInt(
            config.get<string>('BACKOFFICE_DB_POOL_SIZE') ?? '5',
            10,
          ),
        });
        await assertSafeBackofficeDatabaseRole(client);
        return drizzle(client);
      },
    },
  ],
  exports: [DRIZZLE_DB],
})
export class DatabaseModule {}
