import { FastifyAdapter } from "@bull-board/fastify";
import { BullBoardModule } from "@bull-board/nestjs";
import { BullModule } from "@nestjs/bullmq";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { SentryModule } from "@sentry/nestjs/setup";
import {
  AuthModule,
  DatabaseModule,
  LoggerModule,
  MceModule,
  validateWorkerEnv,
} from "@qpp/backend-shared";
import { BullMQOtel } from "bullmq-otel";

import { AdminAuthMiddleware } from "./common/middleware/admin-auth.middleware";
import { HealthModule } from "./health/health.module";
import { MetricsModule } from "./metrics/metrics.module";
import { RedisModule } from "./redis/redis.module";
import { ShellQueryModule } from "./shell-query/shell-query.module";

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateWorkerEnv,
      envFilePath: "../../.env",
    }),
    LoggerModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>("REDIS_URL", "redis://localhost:6379"),
        },
        telemetry: new BullMQOtel("qpp-worker"),
      }),
      inject: [ConfigService],
    }),
    BullBoardModule.forRoot({
      route: "/admin/queues",
      adapter: FastifyAdapter,
    }),
    DatabaseModule,
    AuthModule,
    MceModule,
    HealthModule,
    ShellQueryModule,
    RedisModule,
    MetricsModule,
  ],
  providers: [AdminAuthMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AdminAuthMiddleware).forRoutes("/admin/*path");
  }
}
