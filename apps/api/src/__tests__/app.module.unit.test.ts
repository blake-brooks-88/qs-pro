import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function seedApiEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    'postgres://postgres:password@127.0.0.1:5432/qs_pro';
  process.env.REDIS_URL = 'redis://localhost:6379';

  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.MCE_CLIENT_ID = 'test-client-id';
  process.env.MCE_CLIENT_SECRET = 'test-client-secret';

  process.env.MCE_REDIRECT_URI = 'https://example.com/callback';
  process.env.MCE_JWT_SIGNING_SECRET = 'x'.repeat(32);

  process.env.SESSION_SECRET = 's'.repeat(32);
  process.env.SESSION_SALT = 't'.repeat(16);
  process.env.COOKIE_SECURE = 'true';
  process.env.COOKIE_SAMESITE = 'none';
}

type ConfigServiceStub = {
  get: (key: string, fallback?: string) => string;
};

type ModuleFactory = (
  configService: ConfigServiceStub,
) => Record<string, unknown>;

function interceptBullModule(capture: { factory?: ModuleFactory }) {
  vi.doMock('@nestjs/bullmq', async () => {
    const actual =
      await vi.importActual<typeof import('@nestjs/bullmq')>('@nestjs/bullmq');
    const originalForRootAsync = actual.BullModule.forRootAsync.bind(
      actual.BullModule,
    );

    return {
      ...actual,
      BullModule: Object.assign(actual.BullModule, {
        forRootAsync: (opts: { useFactory: ModuleFactory }) => {
          capture.factory = opts.useFactory;
          return originalForRootAsync(opts as never);
        },
      }),
    };
  });
}

function interceptThrottlerModule(capture: { factory?: ModuleFactory }) {
  vi.doMock('@nestjs/throttler', async () => {
    const actual =
      await vi.importActual<typeof import('@nestjs/throttler')>(
        '@nestjs/throttler',
      );
    const originalForRootAsync = actual.ThrottlerModule.forRootAsync.bind(
      actual.ThrottlerModule,
    );

    return {
      ...actual,
      ThrottlerModule: Object.assign(actual.ThrottlerModule, {
        forRootAsync: (opts: { useFactory: ModuleFactory }) => {
          capture.factory = opts.useFactory;
          return originalForRootAsync(opts as never);
        },
      }),
    };
  });
}

describe('AppModule', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
    vi.clearAllMocks();
  });

  it(
    'configures BullMQ and Throttler factories from environment',
    { timeout: 15000 },
    async () => {
      seedApiEnv();
      vi.resetModules();

      const bull: { factory?: ModuleFactory } = {};
      const throttler: { factory?: ModuleFactory } = {};

      interceptBullModule(bull);
      interceptThrottlerModule(throttler);

      await import('../app.module.js');

      const configStub: ConfigServiceStub = {
        get: (key: string, fallback?: string) =>
          key === 'REDIS_URL'
            ? 'redis://example.com:6379'
            : key === 'NODE_ENV'
              ? 'test'
              : (fallback ?? ''),
      };

      // BullMQ factory connects to Redis via the configured URL
      expect(bull.factory).toBeTypeOf('function');
      const bullResult = (bull.factory as ModuleFactory)(configStub);
      expect(bullResult).toEqual(
        expect.objectContaining({
          connection: { url: 'redis://example.com:6379' },
        }),
      );

      // Throttler factory configures rate limiting with Redis-backed storage
      expect(throttler.factory).toBeTypeOf('function');
      const throttlerResult = (throttler.factory as ModuleFactory)(
        configStub,
      ) as {
        throttlers: { name: string; ttl: number; limit: number }[];
        storage: unknown;
      };
      expect(throttlerResult.throttlers).toEqual([
        { name: 'default', ttl: 60_000, limit: 10_000 },
      ]);
      expect(throttlerResult.storage).toBeInstanceOf(
        ThrottlerStorageRedisService,
      );
    },
  );

  it(
    'applies production throttle limit (120) when NODE_ENV is not test',
    { timeout: 15000 },
    async () => {
      seedApiEnv();
      process.env.NODE_ENV = 'production';
      vi.resetModules();

      const throttler: { factory?: ModuleFactory } = {};
      interceptThrottlerModule(throttler);

      await import('../app.module.js');

      expect(throttler.factory).toBeTypeOf('function');
      const result = (throttler.factory as ModuleFactory)({
        get: (key: string, fallback?: string) =>
          key === 'NODE_ENV' ? 'production' : (fallback ?? ''),
      }) as { throttlers: { limit: number }[] };

      expect(result.throttlers[0].limit).toBe(120);
    },
  );
});
