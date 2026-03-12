import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '.',
  test: {
    name: 'api-e2e',
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    env: {
      NODE_ENV: 'test',
      LOG_FORMAT: 'text',
    },
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/vitest-e2e.setup.ts'],
    hookTimeout: 180000, // 180s for beforeAll/afterAll (app init + cleanup can be slow under coverage)
    testTimeout: 60000, // 60s for individual tests (e2e can be slow under coverage)
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        '**/*.test.ts',
        '**/__tests__/**',
        '**/test/**',
        '**/node_modules/**',
        '**/dist/**',
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
