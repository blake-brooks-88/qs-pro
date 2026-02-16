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

describe('AppModule', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('imports without env validation errors', { timeout: 15000 }, async () => {
    seedApiEnv();

    vi.resetModules();

    let capturedUseFactory:
      | ((configService: {
          get: (key: string, fallback?: string) => string;
        }) => {
          connection: { url: string };
        })
      | undefined;

    vi.doMock('@nestjs/bullmq', async () => {
      const actual =
        await vi.importActual<typeof import('@nestjs/bullmq')>(
          '@nestjs/bullmq',
        );
      const originalForRootAsync = actual.BullModule.forRootAsync.bind(
        actual.BullModule,
      );

      return {
        ...actual,
        BullModule: Object.assign(actual.BullModule, {
          forRootAsync: (opts: { useFactory: typeof capturedUseFactory }) => {
            capturedUseFactory = opts.useFactory;
            return originalForRootAsync(opts as never);
          },
        }),
      };
    });

    const { AppModule } = await import('../app.module.js');
    expect(AppModule).toBeDefined();

    expect(capturedUseFactory).toBeDefined();
    const result = capturedUseFactory?.({
      get: (key: string, fallback?: string) =>
        key === 'REDIS_URL' ? 'redis://example.com:6379' : (fallback ?? ''),
    });
    expect(result).toEqual(
      expect.objectContaining({
        connection: { url: 'redis://example.com:6379' },
      }),
    );
  });
});
