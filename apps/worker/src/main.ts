import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";

import { AppModule } from "./app.module";
import { JsonLogger } from "./common/logger/json-logger.service";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      logger: new JsonLogger(),
    },
  );

  app.enableShutdownHooks();

  // Get port from validated config
  const configService = app.get(ConfigService);
  const port = configService.get('PORT', { infer: true });

  await app.listen(port, "0.0.0.0");
  Logger.log(`Worker running on port ${port}`, "WorkerBootstrap");
}
bootstrap();
