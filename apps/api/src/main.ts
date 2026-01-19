import formBody from '@fastify/formbody';
import secureSession from '@fastify/secure-session';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { getDbFromContext, runWithDbContext } from '@qs-pro/backend-shared';
import { createDatabaseFromClient } from '@qs-pro/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Sql } from 'postgres';

import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

type Session = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(): void;
};

const setSecurityHeaders = (reply: FastifyReply, cookieSecure: boolean) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()',
  );

  // The app is intended to be embedded inside Salesforce Marketing Cloud Engagement.
  reply.header(
    'Content-Security-Policy',
    [
      "frame-ancestors 'self' https://*.exacttarget.com https://*.marketingcloudapps.com",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; '),
  );

  // Prefer setting HSTS at the edge, but this is still safe when HTTPS is enforced.
  if (cookieSecure) {
    reply.header(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }
};

async function bootstrap() {
  const adapter = new FastifyAdapter({
    trustProxy: true,
    ignoreTrailingSlash: true,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bodyParser: false },
  );

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.register(formBody);

  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);
  const sessionSecret =
    configService.get<string>('SESSION_SECRET') ?? process.env.SESSION_SECRET;
  const sessionSalt =
    configService.get<string>('SESSION_SALT') ?? process.env.SESSION_SALT;

  if (!sessionSecret || !sessionSalt) {
    logger.error(
      'SESSION_SECRET and SESSION_SALT are required; set them in the repo root `.env`.',
    );
    throw new Error('Missing session configuration');
  }

  if (sessionSecret.length < 32) {
    logger.error(
      'SESSION_SECRET must be at least 32 characters (use `npx --yes @fastify/secure-session` or a secret manager).',
    );
    throw new Error('Invalid session configuration');
  }

  if (sessionSalt.length < 16) {
    logger.error('SESSION_SALT must be at least 16 characters.');
    throw new Error('Invalid session configuration');
  }

  const cookieSecureRaw = configService.get<string>('COOKIE_SECURE');
  const cookieSecure =
    cookieSecureRaw === 'true'
      ? true
      : cookieSecureRaw === 'false'
        ? false
        : true;

  const cookieSameSiteRaw = configService.get<string>('COOKIE_SAMESITE');
  const cookieSameSite =
    cookieSameSiteRaw === 'none' ||
    cookieSameSiteRaw === 'lax' ||
    cookieSameSiteRaw === 'strict'
      ? cookieSameSiteRaw
      : cookieSecure
        ? 'none'
        : 'lax';

  if (cookieSameSite === 'none' && !cookieSecure) {
    logger.error(
      'Invalid cookie configuration: COOKIE_SAMESITE=none requires COOKIE_SECURE=true.',
    );
    throw new Error('Invalid cookie configuration');
  }

  const cookieDomain = configService.get<string>('COOKIE_DOMAIN') ?? undefined;

  const cookiePartitionedRaw =
    configService.get<string>('COOKIE_PARTITIONED') ?? undefined;
  const cookiePartitioned =
    cookiePartitionedRaw === 'true'
      ? true
      : cookiePartitionedRaw === 'false'
        ? false
        : cookieSameSite === 'none';

  if (cookiePartitioned && cookieDomain) {
    logger.error(
      'Invalid cookie configuration: COOKIE_PARTITIONED=true cannot be used with COOKIE_DOMAIN (partitioned cookies must be host-only).',
    );
    throw new Error('Invalid cookie configuration');
  }

  adapter
    .getInstance()
    .addHook(
      'onSend',
      (_req: FastifyRequest, reply: FastifyReply, _payload, done) => {
        setSecurityHeaders(reply, cookieSecure);
        done();
      },
    );

  await app.register(secureSession, {
    secret: sessionSecret,
    salt: sessionSalt,
    cookie: {
      path: '/',
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      partitioned: cookiePartitioned,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    },
  });

  const sqlClient = app.get<Sql>('SQL_CLIENT');

  const makeDrizzleCompatibleSql = (reserved: Sql): Sql => {
    const reservedWithMeta = reserved as Sql & {
      options: Sql['options'];
      parameters: Sql['parameters'];
    };

    if (!('options' in reservedWithMeta)) {
      Object.defineProperty(reservedWithMeta, 'options', {
        value: sqlClient.options,
        enumerable: false,
      });
    }

    if (!('parameters' in reservedWithMeta)) {
      Object.defineProperty(reservedWithMeta, 'parameters', {
        value: sqlClient.parameters,
        enumerable: false,
      });
    }

    return reservedWithMeta;
  };

  // Establish request-scoped RLS context after secure-session runs (so `req.session` is available).
  // With FORCE RLS enabled, all DB reads/writes must run on a connection where these settings are set.
  // Use `runWithDbContext(db, done)` to reliably propagate AsyncLocalStorage through Fastify/Nest.
  adapter.getInstance().addHook('onRequest', (req, _reply, done) => {
    if (getDbFromContext()) {
      return done();
    }
    if (req.method === 'OPTIONS') {
      return done();
    }

    const session = (req as unknown as { session: Session }).session;
    const tenantId = session?.get('tenantId');
    const mid = session?.get('mid');
    if (typeof tenantId !== 'string' || typeof mid !== 'string') {
      return done();
    }

    void (async () => {
      const reserved = await sqlClient.reserve();
      let released = false;

      const cleanup = async () => {
        if (released) {
          return;
        }
        released = true;
        try {
          await reserved`RESET app.tenant_id`;
          await reserved`RESET app.mid`;
        } catch {
          // ignore
        }
        reserved.release();
      };

      _reply.raw.once('finish', () => {
        void cleanup();
      });
      _reply.raw.once('close', () => {
        void cleanup();
      });
      _reply.raw.once('error', () => {
        void cleanup();
      });

      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${mid}, false)`;

      const db = createDatabaseFromClient(makeDrizzleCompatibleSql(reserved));
      // Cast to generic schema for context holder
      runWithDbContext(db, done);
    })().catch((error: Error) => done(error));
  });

  // MCE can be configured to send the OAuth authorization code back to the app root (`/`).
  // We securely hand off `code` + `state` to the API callback endpoint without processing tokens in the browser.
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
    } catch {
      done();
    }
  });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
