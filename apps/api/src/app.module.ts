import path from 'node:path';

import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  DatabaseModule,
  LoggerModule,
  validateApiEnv,
} from '@qpp/backend-shared';
import { SentryModule } from '@sentry/nestjs/setup';
import { BullMQOtel } from 'bullmq-otel';
import Redis from 'ioredis';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { SessionThrottlerGuard } from './common/guards/session-throttler.guard';
import { FeaturesModule } from './features/features.module';
import { FoldersModule } from './folders/folders.module';
import { MceModule } from './mce/mce.module';
import { ObservabilityModule } from './observability/observability.module';
import { QueryActivitiesModule } from './query-activities/query-activities.module';
import { QueryVersionsModule } from './query-versions/query-versions.module';
import { RedisModule } from './redis/redis.module';
import { SavedQueriesModule } from './saved-queries/saved-queries.module';
import { ShellQueryModule } from './shell-query/shell-query.module';
import { UsageModule } from './usage/usage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateApiEnv,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '..', '..', '..', '.env'),
      ],
    }),
    LoggerModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isTest =
          configService.get<string>('NODE_ENV', 'development') === 'test';
        return {
          throttlers: [
            {
              name: 'default',
              ttl: 60_000,
              limit: isTest ? 10_000 : 120,
            },
          ],
          storage: new ThrottlerStorageRedisService(
            new Redis(
              configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
            ),
          ),
        };
      },
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
        },
        telemetry: new BullMQOtel('qpp-api'),
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    AuditModule,
    AuthModule,
    UsersModule,
    MceModule,
    RedisModule,
    ShellQueryModule,
    FeaturesModule,
    FoldersModule,
    SavedQueriesModule,
    QueryActivitiesModule,
    QueryVersionsModule,
    UsageModule,
    ObservabilityModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: SessionThrottlerGuard,
    },
  ],
})
export class AppModule {}
