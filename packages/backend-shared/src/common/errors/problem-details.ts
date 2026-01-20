import { AppError } from "./app-error";
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
 * Security: 5xx errors get generic detail messages to avoid leaking
 * implementation details. Full error is logged server-side.
 */
export function appErrorToProblemDetails(
  error: AppError,
  requestPath: string,
): ProblemDetails {
  const status = getHttpStatus(error.code);
  const is5xx = status >= 500;

  return {
    type: `urn:qpp:error:${error.code.toLowerCase().replace(/_/g, "-")}`,
    title: getErrorTitle(error.code),
    status,
    detail: is5xx ? "An unexpected error occurred" : error.message,
    instance: requestPath,
  };
}
