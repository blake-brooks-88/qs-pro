import './instrument';

import formBody from '@fastify/formbody';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { handleFatalError } from './bootstrap/handle-fatal-error';
import { configureApp } from './configure-app';

const setSecurityHeaders = (reply: FastifyReply, cookieSecure: boolean) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()',
  );

  reply.header(
    'Content-Security-Policy',
    [
      "frame-ancestors 'self' https://*.exacttarget.com https://*.marketingcloudapps.com",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; '),
  );

  if (cookieSecure) {
    reply.header(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }
};

async function bootstrap() {
  try {
    const adapter = new FastifyAdapter({
      trustProxy: true,
      ignoreTrailingSlash: true,
    });

    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      adapter,
      { bodyParser: false, bufferLogs: true },
    );

    app.useLogger(app.get(Logger));

    await app.register(formBody);

    const configService = app.get(ConfigService);

    const sessionSecret = configService.get('SESSION_SECRET', { infer: true });
    const sessionSalt = configService.get('SESSION_SALT', { infer: true });
    const cookieSecure = configService.get('COOKIE_SECURE', { infer: true });
    const cookieSameSite = configService.get('COOKIE_SAMESITE', {
      infer: true,
    });
    const cookieDomain = configService.get('COOKIE_DOMAIN', { infer: true });
    const cookiePartitioned = configService.get('COOKIE_PARTITIONED', {
      infer: true,
    });

    await configureApp(app, {
      session: {
        secret: sessionSecret,
        salt: sessionSalt,
        cookie: {
          secure: cookieSecure,
          sameSite: cookieSameSite,
          partitioned: cookiePartitioned,
          domain: cookieDomain,
        },
      },
      rls: true,
    });

    adapter
      .getInstance()
      .addHook(
        'onSend',
        (_req: FastifyRequest, reply: FastifyReply, _payload, done) => {
          setSecurityHeaders(reply, cookieSecure);
          done();
        },
      );

    adapter.getInstance().addHook('onRequest', (req, reply, done) => {
      try {
        if (req.method !== 'GET') {
          return done();
        }
        const rawUrl = req.url ?? '/';
        if (rawUrl.startsWith('/api/')) {
          return done();
        }

        const parsed = new URL(rawUrl, 'http://localhost');
        const code = parsed.searchParams.get('code');
        const state = parsed.searchParams.get('state');
        if (!code || !state) {
          return done();
        }

        const qs = new URLSearchParams({ code, state }).toString();
        void reply.redirect(`/api/auth/callback?${qs}`, 302);
        return done();
      } catch {
        done();
      }
    });

    const port = configService.get('PORT', { infer: true });
    await app.listen(port, '0.0.0.0');
  } catch (error) {
    handleFatalError(error);
  }
}

void bootstrap();
