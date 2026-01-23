import { defineConfig } from 'vitest/config';

/**
 * Root Vitest configuration with workspace projects.
 *
 * Each workspace package has its own vitest.config.ts that extends vitest.shared.ts.
 * This root config provides global coverage settings.
 *
 * Recommended test commands:
 *   pnpm test              - Run all tests (recursive, each package uses its own config)
 *   pnpm --filter api test - Run API tests only
 *   pnpm --filter @qpp/web test - Run web tests only
 *
 * Coverage:
 *   pnpm test -- --coverage - Run all tests with coverage aggregation
 */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**', 'packages/*/src/**'],
      exclude: [
        '**/*.test.ts',
        '**/__tests__/**',
        '**/test/**',
        '**/node_modules/**',
        '**/dist/**',
      ],
      reporter: ['text', 'json', 'html'],
    },
    reporters: ['default'],

    projects: [
      'apps/api/vitest.config.ts',
      'apps/web/vitest.config.ts',
      'apps/worker/vitest.config.ts',
      'packages/backend-shared/vitest.config.ts',
      'packages/database/vitest.config.ts',
      'packages/shared-types/vitest.config.ts',
    ],
  },
});
