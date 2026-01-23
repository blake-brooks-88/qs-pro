import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, mergeConfig } from 'vitest/config';

import sharedConfig from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    plugins: [react()],
    test: {
      name: 'web',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  })
);
