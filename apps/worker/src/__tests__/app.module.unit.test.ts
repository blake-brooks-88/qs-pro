import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function seedWorkerEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    'postgres://postgres:password@127.0.0.1:5432/qs_pro';
  process.env.REDIS_URL = 'redis://localhost:6379';

  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.MCE_CLIENT_ID = 'test-client-id';
  process.env.MCE_CLIENT_SECRET = 'test-client-secret';

  process.env.ADMIN_API_KEY = 'test-admin-key';
}

describe('Worker AppModule', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('imports without env validation errors', { timeout: 15000 }, async () => {
    seedWorkerEnv();

    vi.resetModules();

    let capturedUseFactory:
      | ((configService: { get: (key: string, fallback?: string) => string }) => Promise<{
          connection: { url: string };
        }>)
      | undefined;

    vi.doMock('@nestjs/bullmq', async () => {
      const actual = await vi.importActual<typeof import('@nestjs/bullmq')>(
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

    const appModule = new AppModule();
    const forRoutes = vi.fn();
    const apply = vi.fn(() => ({ forRoutes }));
    appModule.configure({ apply } as never);

    expect(forRoutes).toHaveBeenCalledWith('/admin/*path');

    expect(capturedUseFactory).toBeDefined();
    const result = await capturedUseFactory?.({
      get: (key: string, fallback?: string) =>
        key === 'REDIS_URL' ? 'redis://example.com:6379' : (fallback ?? ''),
    });
    expect(result).toEqual({
      connection: { url: 'redis://example.com:6379' },
    });
  });
});
