import './instrument';
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { configureApp } from "./configure-app";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  // Configure admin auth before initializing routes
  configureApp(app);

  app.enableShutdownHooks();

  // Get port from validated config
  const configService = app.get(ConfigService);
  const port = configService.get("PORT", { infer: true });

  await app.listen(port, "0.0.0.0");
  app.get(Logger).log(`Worker running on port ${port}`, "WorkerBootstrap");
}
bootstrap();
