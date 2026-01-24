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
    include: ['test/**/*.integration.test.ts', 'src/**/*.integration.test.ts'],
    setupFiles: ['./test/vitest-integration.setup.ts'],
    hookTimeout: 60000, // 60s for beforeAll (app initialization with DB)
    testTimeout: 30000, // 30s for individual tests
    root: './',
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
