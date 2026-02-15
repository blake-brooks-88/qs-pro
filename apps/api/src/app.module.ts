import path from 'node:path';

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  DatabaseModule,
  LoggerModule,
  validateApiEnv,
} from '@qpp/backend-shared';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { FeaturesModule } from './features/features.module';
import { FoldersModule } from './folders/folders.module';
import { MceModule } from './mce/mce.module';
import { QueryActivitiesModule } from './query-activities/query-activities.module';
import { QueryVersionsModule } from './query-versions/query-versions.module';
import { RedisModule } from './redis/redis.module';
import { SavedQueriesModule } from './saved-queries/saved-queries.module';
import { ShellQueryModule } from './shell-query/shell-query.module';
import { UsageModule } from './usage/usage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateApiEnv,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '..', '..', '..', '.env'),
      ],
    }),
    LoggerModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
        },
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
