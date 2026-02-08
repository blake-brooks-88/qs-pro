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
    app.setGlobalPrefix('api');
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
              await reserved`RESET app.user_id`;
            } catch {
              // ignore
            }
            reserved.release();
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
