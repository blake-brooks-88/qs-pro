import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Integration test configuration for the Worker.
 * Run with: pnpm --filter worker test:integration
 *
 * Integration tests require infrastructure (Postgres, Redis).
 * They are excluded from the default `pnpm test` command and
 * intended to run on CI only.
 */
export default defineConfig({
  test: {
    name: 'worker-integration',
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    root: './',
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      NODE_ENV: 'test',
      LOG_FORMAT: 'text',
      PORT: '3001',
      ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      MCE_CLIENT_ID: 'test_client_id',
      MCE_CLIENT_SECRET: 'test_client_secret',
      ADMIN_API_KEY: 'test_api_key',
    },
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          decoratorMetadata: true,
          legacyDecorator: true,
        },
      },
    }),
  ],
});
