import swc from 'unplugin-swc';
import { defineConfig, mergeConfig } from 'vitest/config';

import sharedConfig from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: 'worker',
      include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
      root: './',
      env: {
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379',
        NODE_ENV: 'test',
        LOG_FORMAT: 'text',
        PORT: '3001',
        ENCRYPTION_KEY:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        MCE_CLIENT_ID: 'test_client_id',
        MCE_CLIENT_SECRET: 'test_client_secret',
        ADMIN_API_KEY: 'test_api_key',
      },
    },
    plugins: [
      swc.vite({
        jsc: {
          parser: {
            syntax: 'typescript',
            decorators: true,
          },
          transform: {
            decoratorMetadata: true,
            legacyDecorator: true,
          },
        },
      }),
    ],
  })
);
