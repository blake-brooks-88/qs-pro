import { z } from "zod";

const HEX_64 = /^[0-9a-fA-F]{64}$/;

// =============================================================================
// Capability Schemas (grouped by module/feature dependency)
// =============================================================================

/**
 * Infrastructure schema - shared by all backend applications.
 * Contains database, cache, and logging configuration.
 */
export const infrastructureSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://postgres:password@127.0.0.1:5432/qs_pro"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  LOG_FORMAT: z.enum(["json", "text"]).default("text"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});

/**
 * MCE Auth schema - required by any app that uses AuthModule/AuthService.
 * These variables are needed for token encryption/decryption and OAuth token refresh.
 */
export const mceAuthSchema = z.object({
  ENCRYPTION_KEY: z
    .string()
    .regex(HEX_64, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),
  MCE_CLIENT_ID: z.string().min(1, "MCE_CLIENT_ID is required"),
  MCE_CLIENT_SECRET: z.string().min(1, "MCE_CLIENT_SECRET is required"),
});

/**
 * MCE JWT schema - required only by API for JWT-based SSO login flow.
 * Worker doesn't need these as it doesn't handle login.
 */
export const mceJwtSchema = z.object({
  MCE_REDIRECT_URI: z.string().url(),
  MCE_JWT_SIGNING_SECRET: z
    .string()
    .min(32, "MCE_JWT_SIGNING_SECRET must be at least 32 characters"),
  MCE_JWT_ISSUER: z.string().optional(),
  MCE_JWT_AUDIENCE: z.string().optional(),
});

/**
 * Session schema - required only by API for secure session management.
 * Contains session secrets and cookie configuration.
 */
export const sessionSchema = z.object({
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_SALT: z
    .string()
    .min(16, "SESSION_SALT must be at least 16 characters"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v: "true" | "false") => v === "true"),
  COOKIE_SAMESITE: z.enum(["none", "lax", "strict"]).default("none"),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_PARTITIONED: z
    .enum(["true", "false"])
    .optional()
    .transform((v: "true" | "false" | undefined) =>
      v === undefined ? undefined : v === "true",
    ),
});

/**
 * Admin schema - required by worker for Bull Board and admin endpoints.
 */
export const adminSchema = z.object({
  ADMIN_API_KEY: z.string().min(1, "ADMIN_API_KEY is required"),
});

// =============================================================================
// Application Schemas (composed from capability schemas)
// =============================================================================

/**
 * API application environment schema.
 * Composes: infrastructure + mceAuth + mceJwt + session
 */
export const apiEnvSchema = infrastructureSchema
  .merge(mceAuthSchema)
  .merge(mceJwtSchema)
  .merge(sessionSchema)
  .extend({
    PORT: z.coerce.number().default(3000),
  })
  .superRefine((data, ctx) => {
    // Cross-field validation: SameSite=none requires Secure=true
    if (data.COOKIE_SAMESITE === "none" && !data.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "COOKIE_SAMESITE=none requires COOKIE_SECURE=true",
      });
    }

    // Preserve legacy behavior: if COOKIE_PARTITIONED is unset, default it based on SameSite.
    const effectivePartitioned =
      data.COOKIE_PARTITIONED ?? data.COOKIE_SAMESITE === "none";

    // Partitioned cookies must be host-only.
    if (effectivePartitioned && data.COOKIE_DOMAIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "COOKIE_PARTITIONED=true cannot be used with COOKIE_DOMAIN (partitioned cookies must be host-only)",
      });
    }

    if (data.NODE_ENV === "production") {
      if (!data.COOKIE_SECURE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "In production, COOKIE_SECURE must be true",
        });
      }

      if (data.COOKIE_SAMESITE !== "none") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "In production, COOKIE_SAMESITE must be 'none'",
        });
      }

      if (!effectivePartitioned) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "In production, COOKIE_PARTITIONED must be true",
        });
      }

      if (data.COOKIE_DOMAIN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "In production, COOKIE_DOMAIN must be unset (host-only)",
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    COOKIE_PARTITIONED:
      data.COOKIE_PARTITIONED ?? data.COOKIE_SAMESITE === "none",
  }));

/**
 * Worker application environment schema.
 * Composes: infrastructure + mceAuth + admin
 *
 * Note: Worker needs mceAuth because it imports AuthModule for MCE API calls.
 * AuthService.refreshToken() requires ENCRYPTION_KEY, MCE_CLIENT_ID, MCE_CLIENT_SECRET.
 */
export const workerEnvSchema = infrastructureSchema
  .merge(mceAuthSchema)
  .merge(adminSchema)
  .extend({
    PORT: z.coerce.number().default(3001),
  });

// =============================================================================
// Legacy Exports (for backwards compatibility)
// =============================================================================

/** @deprecated Use infrastructureSchema instead */
export const baseEnvSchema = infrastructureSchema;

// =============================================================================
// Type Exports
// =============================================================================

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validation functions for use with NestJS ConfigModule.
 * These are called during app bootstrap to validate environment variables.
 *
 * @example
 * ```typescript
 * ConfigModule.forRoot({
 *   validate: validateApiEnv,
 * })
 * ```
 */
export function validateApiEnv(env: Record<string, unknown>) {
  return apiEnvSchema.parse(env);
}

export function validateWorkerEnv(env: Record<string, unknown>) {
  return workerEnvSchema.parse(env);
}
