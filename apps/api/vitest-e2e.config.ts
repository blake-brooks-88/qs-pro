import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    include: ['**/*.e2e-spec.ts'],
    globals: true,
    root: './',
    environment: 'node',
    server: {
      deps: {
        inline: ['@qs-pro/database'],
      },
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});