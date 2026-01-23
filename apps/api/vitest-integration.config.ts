import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

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
    include: ['test/**/*.integration.test.ts'],
    root: './',
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
