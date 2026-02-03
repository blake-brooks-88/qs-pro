import { ErrorCode } from "./error-codes.js";

/**
 * Client-facing error messages for each error code.
 *
 * These messages are:
 * - Remediation-focused (per RFC 9457)
 * - Generic (no internal identifiers)
 * - Auditable in one place
 *
 * SECURITY: All text here is exposed to clients. Never include
 * internal identifiers, paths, or implementation details.
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  // Authentication & Authorization
  [ErrorCode.AUTH_UNAUTHORIZED]: "Authentication required. Please log in.",
  [ErrorCode.AUTH_IDENTITY_MISMATCH]:
    "Identity verification failed. Please log in again.",

  // MCE HTTP Errors
  [ErrorCode.MCE_BAD_REQUEST]: "Invalid request to Marketing Cloud.",
  [ErrorCode.MCE_AUTH_EXPIRED]:
    "Marketing Cloud session expired. Please re-authenticate.",
  [ErrorCode.MCE_CREDENTIALS_MISSING]:
    "No Marketing Cloud credentials found. Please connect your account.",
  [ErrorCode.MCE_TENANT_NOT_FOUND]:
    "Organization not found. Please contact support.",
  [ErrorCode.MCE_FORBIDDEN]:
    "Access denied. You don't have permission for this operation.",
  [ErrorCode.MCE_RATE_LIMITED]:
    "Marketing Cloud rate limit reached. Please wait and try again.",
  [ErrorCode.MCE_SERVER_ERROR]:
    "Marketing Cloud is temporarily unavailable. Please try again.",

  // MCE SOAP Errors
  [ErrorCode.MCE_SOAP_FAILURE]:
    "Marketing Cloud operation failed. Please try again.",
  [ErrorCode.MCE_PAGINATION_EXCEEDED]:
    "Result set too large. Please refine your query.",
  [ErrorCode.MCE_VALIDATION_FAILED]: "Query validation failed.",

  // Query Processing
  [ErrorCode.SELECT_STAR_EXPANSION_FAILED]:
    "Unable to expand SELECT *. Please specify columns explicitly.",
  [ErrorCode.SCHEMA_INFERENCE_FAILED]:
    "Unable to determine result schema. Please check your query.",

  // Business Logic
  [ErrorCode.SEAT_LIMIT_EXCEEDED]: "User limit reached for your organization.",
  [ErrorCode.RATE_LIMIT_EXCEEDED]:
    "Too many requests. Please wait before trying again.",
  [ErrorCode.RESOURCE_NOT_FOUND]: "The requested resource was not found.",
  [ErrorCode.INVALID_STATE]:
    "Operation not allowed in current state. Please try again.",
  [ErrorCode.VALIDATION_ERROR]: "Invalid input. Please check your request.",
  [ErrorCode.FEATURE_NOT_ENABLED]:
    "This feature is not enabled for your subscription.",

  // Infrastructure (these get masked to generic "unexpected error" for 5xx anyway)
  [ErrorCode.CONFIG_ERROR]: "Service configuration error.",
  [ErrorCode.DATABASE_ERROR]: "Database error.",
  [ErrorCode.REDIS_ERROR]: "Cache error.",
  [ErrorCode.INTERNAL_ERROR]: "An internal error occurred.",
  [ErrorCode.UNKNOWN]: "An unexpected error occurred.",
};
