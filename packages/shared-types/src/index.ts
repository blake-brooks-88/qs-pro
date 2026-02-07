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
  TenantFeaturesResponse,
} from "./features.js";
export {
  ALL_FEATURE_KEYS,
  FeatureKeySchema,
  getTierFeatures,
  isTierFeature,
  SubscriptionTierSchema,
  TenantFeaturesResponseSchema,
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

// Testing utilities
export { assertDefined } from "./testing/index.js";

// Folders
export type {
  CreateFolderDto,
  FolderResponse,
  UpdateFolderDto,
} from "./folders.js";
export {
  CreateFolderSchema,
  FolderResponseSchema,
  UpdateFolderSchema,
} from "./folders.js";

// Saved Queries
export type {
  CreateSavedQueryDto,
  SavedQueryListItem,
  SavedQueryResponse,
  UpdateSavedQueryDto,
} from "./saved-queries.js";
export {
  CreateSavedQuerySchema,
  SavedQueryListItemSchema,
  SavedQueryResponseSchema,
  UpdateSavedQuerySchema,
} from "./saved-queries.js";

// Data Extensions
export type {
  CreateDataExtensionDto,
  DataExtensionFieldDto,
  DataRetentionPolicy,
} from "./data-extensions.js";
export {
  CreateDataExtensionSchema,
  CUSTOMER_KEY_VALIDATION,
  DataExtensionFieldSchema,
  DataRetentionPolicySchema,
  DE_NAME_VALIDATION,
  FIELD_NAME_VALIDATION,
} from "./data-extensions.js";

// Query Activities
export type { CreateQueryActivityDto } from "./query-activities.js";
export { CreateQueryActivitySchema } from "./query-activities.js";

// Usage
export type { UsageResponse } from "./usage.js";
export { UsageResponseSchema } from "./usage.js";
