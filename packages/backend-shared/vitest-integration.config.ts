import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * Integration test configuration for backend-shared.
 * Run with: pnpm --filter @qpp/backend-shared test:integration
 *
 * Integration tests require infrastructure (Postgres).
 * They are excluded from the default `pnpm test` command and
 * intended to run on CI only.
 */
export default defineConfig({
  test: {
    name: "backend-shared-integration",
    globals: true,
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["./test/vitest-integration.setup.ts"],
    hookTimeout: 60000, // 60s for beforeAll (app initialization with DB)
    testTimeout: 30000, // 30s for individual tests
    root: "./",
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
});
