import { AppError } from "./app-error";
import { ErrorCode } from "./error-codes";

/**
 * Terminal errors should NOT be retried - they will fail again.
 * Examples: validation failures, missing credentials, business rule violations.
 */
const TERMINAL_CODES = new Set<ErrorCode>([
  // Authentication errors
  ErrorCode.AUTH_UNAUTHORIZED,
  ErrorCode.AUTH_IDENTITY_MISMATCH,

  // MCE HTTP errors that won't resolve with retry
  ErrorCode.MCE_BAD_REQUEST,
  ErrorCode.MCE_AUTH_EXPIRED,
  ErrorCode.MCE_CREDENTIALS_MISSING,
  ErrorCode.MCE_TENANT_NOT_FOUND,
  ErrorCode.MCE_FORBIDDEN,

  // MCE SOAP errors
  ErrorCode.MCE_SOAP_FAILURE,
  ErrorCode.MCE_PAGINATION_EXCEEDED,

  // Domain errors
  ErrorCode.MCE_VALIDATION_FAILED,
  ErrorCode.SELECT_STAR_EXPANSION_FAILED,
  ErrorCode.SCHEMA_INFERENCE_FAILED,

  // Business logic
  ErrorCode.SEAT_LIMIT_EXCEEDED,
  ErrorCode.RATE_LIMIT_EXCEEDED,
  ErrorCode.RESOURCE_NOT_FOUND,
  ErrorCode.INVALID_STATE,
  ErrorCode.VALIDATION_ERROR,
  ErrorCode.FEATURE_NOT_ENABLED,

  // Infrastructure (misconfiguration won't fix itself)
  ErrorCode.CONFIG_ERROR,
  ErrorCode.INTERNAL_ERROR,
]);

/**
 * Determines if an error is terminal (should NOT be retried).
 *
 * Design: "Retry unless terminal"
 * - Unknown errors (non-AppError) → retry (safe default for transient failures)
 * - AppError with terminal code → don't retry
 * - AppError with non-terminal code → retry
 */
export function isTerminal(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return false;
  }
  return TERMINAL_CODES.has(error.code);
}

/**
 * Unrecoverable errors should stop ALL processing immediately.
 * No retry, no fallback, no probing will help - the fundamental
 * operation is broken (auth, config, permissions).
 *
 * This is a SUBSET of terminal errors. Use this in inner loops
 * (probing, fallback) where you need to distinguish "give up entirely"
 * from "this attempt failed, try another way".
 */
const UNRECOVERABLE_CODES = new Set<ErrorCode>([
  ErrorCode.AUTH_UNAUTHORIZED,
  ErrorCode.AUTH_IDENTITY_MISMATCH,
  ErrorCode.MCE_AUTH_EXPIRED,
  ErrorCode.MCE_CREDENTIALS_MISSING,
  ErrorCode.MCE_TENANT_NOT_FOUND,
  ErrorCode.MCE_FORBIDDEN,
  ErrorCode.CONFIG_ERROR,
]);

export function isUnrecoverable(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return false;
  }
  return UNRECOVERABLE_CODES.has(error.code);
}

/**
 * Retryable errors MAY succeed on retry (transient failures).
 * Examples: rate limiting, server overload, network glitches.
 *
 * Design: Retry only specific transient codes.
 * - MCE_RATE_LIMITED (429) → retry with Retry-After
 * - MCE_SERVER_ERROR (5xx) → retry with backoff
 * - All other codes → don't retry
 */
const RETRYABLE_CODES = new Set<ErrorCode>([
  ErrorCode.MCE_RATE_LIMITED,
  ErrorCode.MCE_SERVER_ERROR,
]);

export function isRetryable(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return false;
  }
  return RETRYABLE_CODES.has(error.code);
}

/**
 * Maps AppError codes to HTTP status codes.
 * Used by GlobalExceptionFilter for domain errors.
 */
export function getHttpStatus(code: ErrorCode): number {
  switch (code) {
    // Authentication errors
    case ErrorCode.AUTH_UNAUTHORIZED:
    case ErrorCode.AUTH_IDENTITY_MISMATCH:
      return 401;

    // MCE HTTP errors - preserve original status
    case ErrorCode.MCE_BAD_REQUEST:
      return 400;
    case ErrorCode.MCE_AUTH_EXPIRED:
    case ErrorCode.MCE_CREDENTIALS_MISSING:
      return 401;
    // MCE_TENANT_NOT_FOUND: User's auth context references a non-existent tenant.
    // This is a data integrity issue requiring re-authentication, not "resource not found".
    case ErrorCode.MCE_TENANT_NOT_FOUND:
      return 401;
    case ErrorCode.MCE_FORBIDDEN:
      return 403;
    case ErrorCode.MCE_RATE_LIMITED:
      return 429;
    case ErrorCode.MCE_SERVER_ERROR:
      return 502; // Bad Gateway - upstream server error

    // Domain validation errors
    case ErrorCode.MCE_VALIDATION_FAILED:
    case ErrorCode.SELECT_STAR_EXPANSION_FAILED:
    case ErrorCode.SCHEMA_INFERENCE_FAILED:
    case ErrorCode.VALIDATION_ERROR:
      return 400;

    // Business logic
    case ErrorCode.SEAT_LIMIT_EXCEEDED:
      return 403;
    case ErrorCode.RATE_LIMIT_EXCEEDED:
      return 429;
    case ErrorCode.RESOURCE_NOT_FOUND:
      return 404;
    case ErrorCode.INVALID_STATE:
      return 409; // Conflict
    case ErrorCode.FEATURE_NOT_ENABLED:
      return 403;

    // Infrastructure
    case ErrorCode.CONFIG_ERROR:
      return 500;

    // Infrastructure / Unknown
    default:
      return 500;
  }
}

/**
 * Maps error code to human-readable title for RFC 9457 responses.
 */
export function getErrorTitle(code: ErrorCode): string {
  const titles: Record<ErrorCode, string> = {
    [ErrorCode.AUTH_UNAUTHORIZED]: "Unauthorized",
    [ErrorCode.AUTH_IDENTITY_MISMATCH]: "Identity Mismatch",
    [ErrorCode.MCE_BAD_REQUEST]: "MCE Bad Request",
    [ErrorCode.MCE_AUTH_EXPIRED]: "MCE Authentication Expired",
    [ErrorCode.MCE_CREDENTIALS_MISSING]: "MCE Credentials Missing",
    [ErrorCode.MCE_TENANT_NOT_FOUND]: "MCE Tenant Not Found",
    [ErrorCode.MCE_FORBIDDEN]: "MCE Access Denied",
    [ErrorCode.MCE_RATE_LIMITED]: "MCE Rate Limited",
    [ErrorCode.MCE_SERVER_ERROR]: "MCE Server Error",
    [ErrorCode.MCE_SOAP_FAILURE]: "MCE SOAP Operation Failed",
    [ErrorCode.MCE_PAGINATION_EXCEEDED]: "Pagination Limit Exceeded",
    [ErrorCode.MCE_VALIDATION_FAILED]: "Query Validation Failed",
    [ErrorCode.SELECT_STAR_EXPANSION_FAILED]: "SELECT * Expansion Failed",
    [ErrorCode.SCHEMA_INFERENCE_FAILED]: "Schema Inference Failed",
    [ErrorCode.SEAT_LIMIT_EXCEEDED]: "Seat Limit Exceeded",
    [ErrorCode.RATE_LIMIT_EXCEEDED]: "Rate Limit Exceeded",
    [ErrorCode.RESOURCE_NOT_FOUND]: "Resource Not Found",
    [ErrorCode.INVALID_STATE]: "Invalid State",
    [ErrorCode.VALIDATION_ERROR]: "Validation Error",
    [ErrorCode.FEATURE_NOT_ENABLED]: "Feature Not Enabled",
    [ErrorCode.CONFIG_ERROR]: "Configuration Error",
    [ErrorCode.DATABASE_ERROR]: "Database Error",
    [ErrorCode.REDIS_ERROR]: "Redis Error",
    [ErrorCode.INTERNAL_ERROR]: "Internal Error",
    [ErrorCode.UNKNOWN]: "Internal Server Error",
  };
  return titles[code];
}
