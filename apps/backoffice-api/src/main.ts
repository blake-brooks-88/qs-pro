import cors from '@fastify/cors';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';

const setSecurityHeaders = (reply: FastifyReply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()',
  );
};

async function bootstrap() {
  const adapter = new FastifyAdapter({
    trustProxy: true,
    ignoreTrailingSlash: true,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const webOrigin =
    configService.get<string>('BACKOFFICE_WEB_ORIGIN') ??
    'http://localhost:5174';

  await app.register(cors, {
    origin: webOrigin,
    credentials: true,
  });

  adapter
    .getInstance()
    .addHook(
      'onSend',
      (_req: FastifyRequest, reply: FastifyReply, _payload, done) => {
        setSecurityHeaders(reply);
        done();
      },
    );

  app.setGlobalPrefix('api');

  const port = configService.get<number>('BACKOFFICE_API_PORT') ?? 3002;
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
