import { defineConfig } from "vitest/config";

/**
 * Integration test configuration for the database package.
 * Run with: pnpm --filter @qpp/database test:integration
 *
 * Integration tests require a running Postgres instance.
 * They are excluded from the default `pnpm test` command and
 * intended to run on CI only.
 */
export default defineConfig({
  test: {
    name: "database-integration",
    globals: true,
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    root: "./",
    globalSetup: ["../../apps/api/test/global-setup.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        "**/*.test.ts",
        "**/__tests__/**",
        "**/test/**",
        "**/node_modules/**",
        "**/dist/**",
      ],
      reporter: ["text", "json", "json-summary", "html"],
    },
  },
});
