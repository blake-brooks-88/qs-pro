import { defineConfig, mergeConfig } from "vitest/config";

import sharedConfig from "../../vitest.shared";

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: "database",
      include: ["src/**/*.test.ts"],
      root: "./",
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
);
