import { z } from "zod";

export const EnvVarSchema = z.object({
  PORT: z.string().transform(Number).default("3000"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type EnvVars = z.infer<typeof EnvVarSchema>;

// Feature flags
export type {
  FeatureKey,
  SubscriptionTier,
  TenantFeatures,
} from "./features.js";
export {
  ALL_FEATURE_KEYS,
  FeatureKeySchema,
  getTierFeatures,
  isTierFeature,
  SubscriptionTierSchema,
  TenantFeaturesSchema,
  TIER_FEATURES,
} from "./features.js";

// Shell query types
export type {
  CreateRunRequest,
  FieldDefinition,
  TableMetadata,
} from "./shell-query.js";

// Error handling
export { ErrorCode, ErrorMessages } from "./errors/index.js";
