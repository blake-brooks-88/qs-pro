import { describe, expect, it } from "vitest";

import {
  apiEnvSchema,
  validateApiEnv,
  validateWorkerEnv,
  workerEnvSchema,
} from "../env.schema";

const VALID_HEX_64 = "a".repeat(64);

function makeApiEnv(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: "development",
    ENCRYPTION_KEY: VALID_HEX_64,
    MCE_CLIENT_ID: "client-id",
    MCE_CLIENT_SECRET: "client-secret",
    MCE_REDIRECT_URI: "https://example.com/callback",
    MCE_JWT_SIGNING_SECRET: "x".repeat(32),
    SESSION_SECRET: "y".repeat(32),
    SESSION_SALT: "z".repeat(16),
    ...overrides,
  };
}

function makeWorkerEnv(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: "development",
    ENCRYPTION_KEY: VALID_HEX_64,
    MCE_CLIENT_ID: "client-id",
    MCE_CLIENT_SECRET: "client-secret",
    ADMIN_API_KEY: "admin-key",
    ...overrides,
  };
}

describe("env.schema", () => {
  describe("apiEnvSchema", () => {
    it("parses a minimal valid env and applies cookie defaults", () => {
      const result = apiEnvSchema.safeParse(makeApiEnv());

      expect(result.success).toBe(true);
      if (!result.success) {
        throw new Error("Expected parse to succeed");
      }

      expect(result.data.PORT).toBe(3000);
      expect(result.data.COOKIE_SAMESITE).toBe("none");
      expect(result.data.COOKIE_SECURE).toBe(true);
      expect(result.data.COOKIE_PARTITIONED).toBe(true);
    });

    it("rejects SameSite=none when COOKIE_SECURE=false", () => {
      const result = apiEnvSchema.safeParse(
        makeApiEnv({ COOKIE_SAMESITE: "none", COOKIE_SECURE: "false" }),
      );

      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("Expected parse to fail");
      }

      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(
        "COOKIE_SAMESITE=none requires COOKIE_SECURE=true",
      );
    });

    it("rejects production with COOKIE_DOMAIN set", () => {
      const result = apiEnvSchema.safeParse(
        makeApiEnv({
          NODE_ENV: "production",
          COOKIE_DOMAIN: "example.com",
        }),
      );

      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("Expected parse to fail");
      }

      const messages = result.error.issues
        .map((issue) => issue.message)
        .join(" ");
      expect(messages).toContain("COOKIE_DOMAIN");
    });

    it("rejects production when COOKIE_SAMESITE is not 'none'", () => {
      const result = apiEnvSchema.safeParse(
        makeApiEnv({
          NODE_ENV: "production",
          COOKIE_SAMESITE: "lax",
        }),
      );

      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("Expected parse to fail");
      }

      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(
        "In production, COOKIE_SAMESITE must be 'none'",
      );
    });

    it("rejects production when COOKIE_PARTITIONED is explicitly false", () => {
      const result = apiEnvSchema.safeParse(
        makeApiEnv({
          NODE_ENV: "production",
          COOKIE_SAMESITE: "none",
          COOKIE_PARTITIONED: "false",
        }),
      );

      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("Expected parse to fail");
      }

      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(
        "In production, COOKIE_PARTITIONED must be true",
      );
    });

    it("treats METRICS_API_KEY as optional but rejects empty string", () => {
      const missing = apiEnvSchema.safeParse(makeApiEnv());
      expect(missing.success).toBe(true);

      const empty = apiEnvSchema.safeParse(makeApiEnv({ METRICS_API_KEY: "" }));
      expect(empty.success).toBe(false);

      const present = apiEnvSchema.safeParse(
        makeApiEnv({ METRICS_API_KEY: "metrics-key" }),
      );
      expect(present.success).toBe(true);
    });

    it("exposes validateApiEnv() for NestJS ConfigModule usage", () => {
      const parsed = validateApiEnv(makeApiEnv());
      expect(parsed.PORT).toBe(3000);
    });
  });

  describe("workerEnvSchema", () => {
    it("parses a minimal valid env without METRICS_API_KEY", () => {
      const result = workerEnvSchema.safeParse(makeWorkerEnv());

      expect(result.success).toBe(true);
      if (!result.success) {
        throw new Error("Expected parse to succeed");
      }

      expect(result.data.PORT).toBe(3001);
    });

    it("requires ADMIN_API_KEY", () => {
      const result = workerEnvSchema.safeParse(
        makeWorkerEnv({ ADMIN_API_KEY: "" }),
      );

      expect(result.success).toBe(false);
    });

    it("exposes validateWorkerEnv() for NestJS ConfigModule usage", () => {
      const parsed = validateWorkerEnv(makeWorkerEnv());
      expect(parsed.PORT).toBe(3001);
    });
  });
});
