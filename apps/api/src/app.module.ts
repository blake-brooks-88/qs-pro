import path from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  DatabaseModule,
  LoggerModule,
  validateApiEnv,
} from '@qpp/backend-shared';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { FeaturesModule } from './features/features.module';
import { MceModule } from './mce/mce.module';
import { RedisModule } from './redis/redis.module';
import { ShellQueryModule } from './shell-query/shell-query.module';
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
    DatabaseModule,
    AuthModule,
    UsersModule,
    MceModule,
    RedisModule,
    ShellQueryModule,
    FeaturesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
