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
import { AuditService } from './audit/audit.service';
import { handleFatalError } from './bootstrap/handle-fatal-error';
import { configureApp } from './configure-app';

const setSecurityHeaders = (reply: FastifyReply, cookieSecure: boolean) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  // XFO is redundant with CSP frame-ancestors below, but kept for
  // defense-in-depth (older browsers) and AppExchange security review.
  // It does not affect fetch/XHR calls from the MCE-framed frontend.
  reply.header('X-Frame-Options', 'SAMEORIGIN');
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
        if (
          !parsed.searchParams.has('code') ||
          !parsed.searchParams.has('state')
        ) {
          return done();
        }

        void reply.redirect(
          `/api/auth/callback?${parsed.searchParams.toString()}`,
          302,
        );
        return done();
      } catch (redirectError) {
        // Monitoring: if this starts firing in production it may indicate invalid
        // inbound URLs (proxy) or an unexpected auth callback shape. Keep this
        // debug-only to avoid log spam.
        if (process.env.NODE_ENV !== 'production') {
          req.log.debug(
            { err: redirectError },
            'OAuth redirect helper failed; continuing request',
          );
        }
        done();
      }
    });

    const auditService = app.get(AuditService);
    adapter.getInstance().addHook('onResponse', (req, reply, done) => {
      const expiredCtx = (
        req as unknown as {
          sessionExpiredContext?: {
            reason: string;
            userId: string;
            tenantId: string;
            mid: string;
          };
        }
      ).sessionExpiredContext;

      if (expiredCtx && reply.statusCode === 401) {
        // Fire-and-forget is intentional: AuditService.log() reserves its own
        // pooled connection (via runWithTenantContext), so it is independent of
        // the request-scoped connection lifecycle. Errors are caught internally.
        void auditService.log({
          eventType: 'auth.session_expired',
          actorType: 'user',
          actorId: expiredCtx.userId,
          tenantId: expiredCtx.tenantId,
          mid: expiredCtx.mid,
          targetId: expiredCtx.userId,
          metadata: { reason: expiredCtx.reason },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }
      done();
    });

    const port = configService.get('PORT', { infer: true });
    await app.listen(port, '0.0.0.0');
  } catch (error) {
    handleFatalError(error);
  }
}

void bootstrap();
