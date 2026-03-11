import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'backoffice-api',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/*.e2e-spec.ts', '**/*.e2e.test.ts', 'node_modules/**'],
    root: './',
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ['./test/vitest-setup.ts'],
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
