import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import { LoggerModule as PinoLoggerModule } from "nestjs-pino";

interface RequestWithUser extends IncomingMessage {
  user?: {
    tenantId?: string;
    userId?: string;
    mid?: string;
  };
}

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get("NODE_ENV", { infer: true });
        const logFormat = config.get("LOG_FORMAT", { infer: true });
        const logLevel = config.get("LOG_LEVEL", { infer: true });
        const isProduction = nodeEnv === "production";
        const useJson = logFormat === "json" || isProduction;

        return {
          pinoHttp: {
            level: logLevel ?? (isProduction ? "info" : "debug"),
            transport: useJson
              ? undefined
              : {
                  target: "pino-pretty",
                  options: { colorize: true, translateTime: "SYS:standard" },
                },
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "password",
                "token",
                "secret",
                "sessionSecret",
              ],
              censor: "[REDACTED]",
            },
            genReqId: (req: IncomingMessage) =>
              (req.headers["x-request-id"] as string) || randomUUID(),
            customProps: (req: IncomingMessage, _res: ServerResponse) => {
              const reqWithUser = req as RequestWithUser;
              return {
                service: process.env.SERVICE_NAME || "unknown",
                tenantId: reqWithUser.user?.tenantId,
                userId: reqWithUser.user?.userId,
                mid: reqWithUser.user?.mid,
              };
            },
            autoLogging: {
              ignore: (req: IncomingMessage) =>
                req.url === "/health" || req.url === "/metrics",
            },
          },
        };
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
