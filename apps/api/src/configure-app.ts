import secureSession from '@fastify/secure-session';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { getDbFromContext, runWithDbContext } from '@qpp/backend-shared';
import { createDatabaseFromClient } from '@qpp/database';
import type { Sql } from 'postgres';

import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

type Session = {
  get(key: string): unknown;
};

export interface SessionOptions {
  secret: string;
  salt: string;
  cookie: {
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    partitioned?: boolean;
    domain?: string;
  };
}

export interface ConfigureAppOptions {
  /** Set to false in tests that don't want /api prefix. Default: true */
  globalPrefix?: boolean;
  /** Session configuration. If provided, registers @fastify/secure-session */
  session?: SessionOptions;
  /** If true, sets up the RLS context hook. Requires session to be configured. */
  rls?: boolean;
}

export async function configureApp(
  app: NestFastifyApplication,
  options: ConfigureAppOptions = {},
): Promise<NestFastifyApplication> {
  const { globalPrefix = true, session, rls = false } = options;

  if (globalPrefix) {
    app.setGlobalPrefix('api', {
      exclude: ['livez', 'readyz', 'metrics'],
    });
  }

  app.useGlobalFilters(new GlobalExceptionFilter());

  if (session) {
    await app.register(secureSession, {
      secret: session.secret,
      salt: session.salt,
      cookie: {
        path: '/',
        httpOnly: true,
        secure: session.cookie.secure,
        sameSite: session.cookie.sameSite,
        partitioned: session.cookie.partitioned,
        ...(session.cookie.domain ? { domain: session.cookie.domain } : {}),
      },
    });
  }

  if (rls) {
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

    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (req, reply, done) => {
        if (getDbFromContext()) {
          return done();
        }
        if (req.method === 'OPTIONS') {
          return done();
        }

        const reqSession = (req as unknown as { session: Session }).session;
        const tenantId = reqSession?.get('tenantId');
        const mid = reqSession?.get('mid');
        if (typeof tenantId !== 'string' || typeof mid !== 'string') {
          return done();
        }

        void (async () => {
          const reserved = await Promise.race([
            sqlClient.reserve(),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error('RLS connection reserve timeout')),
                5000,
              ),
            ),
          ]);
          let released = false;

          const cleanup = async () => {
            if (released) {
              return;
            }
            released = true;
            let cleanupUnsafe = false;
            try {
              await reserved`SELECT set_config('app.tenant_id', '', false), set_config('app.mid', '', false), set_config('app.user_id', '', false)`;
            } catch (clearError) {
              cleanupUnsafe = true;
              reply.log.error(
                { err: clearError },
                'Failed to clear RLS context before releasing connection',
              );
              try {
                // SECURITY: If we can't clear tenant context, the connection may be returned
                // to the pool with stale session variables, risking cross-tenant data access.
                // DISCARD ALL is a stronger session reset; if it fails too, fail closed.
                await reserved`DISCARD ALL`;
                cleanupUnsafe = false;
              } catch (discardError) {
                reply.log.error(
                  { err: discardError },
                  'Failed to DISCARD ALL after RLS clear failure',
                );
              }
            }
            reserved.release();

            if (cleanupUnsafe && process.env.NODE_ENV === 'production') {
              // Monitoring: if this ever happens in prod, treat it as a critical incident.
              // We crash to avoid reusing a potentially tainted pooled connection.
              setImmediate(() => process.exit(1));
            }
          };

          reply.raw.once('finish', () => {
            void cleanup();
          });
          reply.raw.once('close', () => {
            void cleanup();
          });
          reply.raw.once('error', () => {
            void cleanup();
          });

          await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
          await reserved`SELECT set_config('app.mid', ${mid}, false)`;

          const db = createDatabaseFromClient(
            makeDrizzleCompatibleSql(reserved),
          );
          runWithDbContext(db, done, makeDrizzleCompatibleSql(reserved));
        })().catch((error: Error) => done(error));
      });
  }

  return app;
}
