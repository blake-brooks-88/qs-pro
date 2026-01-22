import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    environment: 'node',
    env: {
      // Infrastructure
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      NODE_ENV: 'test',
      LOG_FORMAT: 'text',
      PORT: '3001',
      // MCE Auth (required by AuthModule)
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      MCE_CLIENT_ID: 'test_client_id',
      MCE_CLIENT_SECRET: 'test_client_secret',
      // Admin
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
});
