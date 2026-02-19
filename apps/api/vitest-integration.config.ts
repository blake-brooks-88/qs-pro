import swc from 'unplugin-swc';
import { coverageConfigDefaults, defineConfig } from 'vitest/config';

/**
 * Integration test configuration for the API.
 * Run with: pnpm --filter api test:integration
 *
 * Integration tests require infrastructure (Postgres, Redis).
 * They are excluded from the default `pnpm test` command and
 * intended to run on CI only.
 */
export default defineConfig({
  test: {
    name: 'api-integration',
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.test.ts', 'src/**/*.integration.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/vitest-e2e.setup.ts'],
    hookTimeout: 180000, // 180s for beforeAll/afterAll (app init + cleanup with DB)
    testTimeout: 60000, // 60s for individual tests (integration can be slow under coverage)
    root: './',
    pool: 'forks',
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
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
