import { AppError } from "./app-error";
import { ErrorCode } from "./error-codes";
import { getErrorTitle, getHttpStatus } from "./error-policy";

/**
 * RFC 9457 Problem Details format for HTTP error responses.
 * Provides machine-readable error information to API clients.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  // Extension fields (typed, safe)
  violations?: string[];
  field?: string;
  retryAfter?: number;
}

/**
 * Converts an AppError to RFC 9457 Problem Details format.
 *
 * Security strategy for 5xx errors:
 * - Internal infrastructure errors (database, Redis, config) → generic type/title/detail
 * - Upstream service errors (MCE 5xx) → preserve specific type/title for debugging
 *
 * This prevents reconnaissance of our internals while exposing helpful upstream status.
 * Full error details logged server-side for all 5xx errors.
 */
export function appErrorToProblemDetails(
  error: AppError,
  requestPath: string,
): ProblemDetails {
  const status = getHttpStatus(error.code);
  const is5xx = status >= 500;
  const isUpstreamError = error.code === ErrorCode.MCE_SERVER_ERROR;
  const shouldMaskType = is5xx && !isUpstreamError;

  const base: ProblemDetails = {
    type: shouldMaskType
      ? "urn:qpp:error:internal-server-error"
      : `urn:qpp:error:${error.code.toLowerCase().replace(/_/g, "-")}`,
    title: shouldMaskType ? "Internal Server Error" : getErrorTitle(error.code),
    status,
    detail: is5xx ? "An unexpected error occurred" : error.message,
    instance: requestPath,
  };

  // Add extensions for non-5xx errors (safe to expose)
  if (!is5xx && error.extensions) {
    if (error.extensions.violations) {
      base.violations = error.extensions.violations;
    }
    if (error.extensions.field) {
      base.field = error.extensions.field;
    }
    if (error.extensions.retryAfter) {
      base.retryAfter = error.extensions.retryAfter;
    }
  }

  return base;
}
