import { defineConfig } from 'vitest/config';

/**
 * Root Vitest configuration with workspace projects.
 *
 * Each workspace package has its own vitest.config.ts that extends vitest.shared.ts.
 * This root config aggregates all workspace configs.
 *
 * Run specific project:
 *   pnpm vitest --project api
 *   pnpm vitest --project web
 *   pnpm vitest --project worker
 *
 * Run all tests:
 *   pnpm test (recursive via pnpm -r test)
 *   pnpm vitest (uses this workspace config)
 */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**', 'packages/*/src/**'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
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
