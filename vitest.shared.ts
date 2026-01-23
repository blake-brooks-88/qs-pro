import { defineConfig } from 'vitest/config';

/**
 * Shared Vitest configuration for qs-pro monorepo.
 * Per-package configs should use mergeConfig to extend this.
 *
 * @example
 * import { mergeConfig } from 'vitest/config';
 * import sharedConfig from '../../vitest.shared';
 * export default mergeConfig(sharedConfig, defineConfig({ ... }));
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.e2e.test.ts',
      '**/*.integration.test.ts',
    ],
    env: {
      NODE_ENV: 'test',
      LOG_FORMAT: 'text',
    },
  },
});
