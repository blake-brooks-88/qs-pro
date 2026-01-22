import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.spec.ts'],
    exclude: ['**/*.e2e-spec.ts', 'node_modules/**'],
    globals: true,
    root: './',
    environment: 'node',
  },
  plugins: [
    // This is required to support NestJS decorators and metadata in Vitest
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
