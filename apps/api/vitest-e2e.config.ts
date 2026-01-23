import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.e2e.test.ts'],
    globals: true,
    root: './',
    environment: 'node',
    setupFiles: ['./test/vitest-e2e.setup.ts'],
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
