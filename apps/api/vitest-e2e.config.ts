import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api-e2e',
    include: ['**/*.e2e.test.ts'],
    globals: true,
    root: './',
    environment: 'node',
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
