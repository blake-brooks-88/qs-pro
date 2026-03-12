import swc from 'unplugin-swc';
import { coverageConfigDefaults, defineConfig } from 'vitest/config';

/**
 * Integration test configuration for the Backoffice API.
 *
 * These tests require infrastructure (Postgres, Redis) and are intended to run
 * in CI or local environments with docker-compose running.
 */
export default defineConfig({
  test: {
    name: 'backoffice-api-integration',
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    root: './',
    pool: 'forks',
    setupFiles: ['./test/vitest-integration.setup.ts'],
    hookTimeout: 180000, // 180s for beforeAll/afterAll (app init + cleanup with DB)
    testTimeout: 60000, // 60s for individual tests (integration can be slow under coverage)
    env: {
      NODE_ENV: 'test',
      LOG_FORMAT: 'text',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        '**/*.test.ts',
        '**/__tests__/**',
        '**/test/**',
        '**/node_modules/**',
        '**/dist/**',
        ...coverageConfigDefaults.exclude,
      ],
      reporter: ['text', 'json', 'json-summary', 'html'],
    },
    server: {
      deps: {
        inline: ['@qpp/database'],
      },
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});

