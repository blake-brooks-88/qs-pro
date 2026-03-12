import swc from "unplugin-swc";
import { coverageConfigDefaults, defineConfig } from "vitest/config";

/**
 * Integration test configuration for the backoffice API.
 *
 * Integration tests require Postgres (DATABASE_URL_BACKOFFICE) and exercise
 * the real NestJS DI graph + real Drizzle DB. Only external boundaries (Stripe,
 * Better Auth HTTP handler, etc.) should be mocked.
 */
export default defineConfig({
  test: {
    name: "backoffice-api-integration",
    globals: true,
    environment: "node",
    root: "./",
    include: ["test/**/*.integration.test.ts"],
    setupFiles: ["./test/vitest-integration.setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        "**/*.test.ts",
        "**/__tests__/**",
        "**/test/**",
        "**/node_modules/**",
        "**/dist/**",
        ...coverageConfigDefaults.exclude,
      ],
      reporter: ["text", "json", "json-summary", "html"],
    },
    env: {
      NODE_ENV: "test",
      LOG_FORMAT: "text",
    },
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
});

