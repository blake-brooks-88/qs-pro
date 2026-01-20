import { AppError } from "./app-error";
import { ErrorCode } from "./error-codes";
import { getErrorTitle, getHttpStatus } from "./error-policy";

/**
 * RFC 9457 Problem Details format for HTTP error responses.
 * Provides machine-readable error information to API clients.
 */
export interface ProblemDetails {
  type: string; // URN format: urn:qpp:error:seat-limit-exceeded
  title: string; // Human-readable summary
  status: number; // HTTP status code
  detail: string; // Specific error message (masked for 5xx)
  instance: string; // Request path
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
  // Upstream service errors expose type/title (tells client MCE is down)
  // but mask detail (don't leak Salesforce internal errors)
  const isUpstreamError = error.code === ErrorCode.MCE_SERVER_ERROR;
  const shouldMaskType = is5xx && !isUpstreamError;

  return {
    type: shouldMaskType
      ? "urn:qpp:error:internal-server-error"
      : `urn:qpp:error:${error.code.toLowerCase().replace(/_/g, "-")}`,
    title: shouldMaskType ? "Internal Server Error" : getErrorTitle(error.code),
    status,
    detail: is5xx ? "An unexpected error occurred" : error.message,
    instance: requestPath,
  };
}
