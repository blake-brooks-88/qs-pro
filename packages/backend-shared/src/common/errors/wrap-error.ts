import { AppError } from "./app-error";
import { ErrorCode } from "./error-codes";

/**
 * Converts unknown errors to AppError for domain error handling.
 *
 * NOTE: This should NOT be used for HttpException handling in the API layer.
 * The GlobalExceptionFilter handles HttpExceptions separately to preserve
 * their HTTP semantics.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  // Handle backward compatibility - these imports will only resolve
  // if the old error classes still exist (during migration)
  try {
    // Try to import old error classes dynamically to avoid hard errors
    // This allows toAppError to work during transition period
    if ("MceOperationError" in (error as Record<string, unknown>)) {
      return new AppError(
        ErrorCode.MCE_SOAP_FAILURE,
        (error as Error).message,
        error,
      );
    }
    if ("McePaginationError" in (error as Record<string, unknown>)) {
      return new AppError(
        ErrorCode.MCE_PAGINATION_EXCEEDED,
        (error as Error).message,
        error,
      );
    }
    if ("MceValidationError" in (error as Record<string, unknown>)) {
      return new AppError(
        ErrorCode.MCE_VALIDATION_FAILED,
        (error as Error).message,
        error,
      );
    }
    if ("SelectStarExpansionError" in (error as Record<string, unknown>)) {
      return new AppError(
        ErrorCode.SELECT_STAR_EXPANSION_FAILED,
        (error as Error).message,
        error,
      );
    }
    if ("SchemaInferenceError" in (error as Record<string, unknown>)) {
      return new AppError(
        ErrorCode.SCHEMA_INFERENCE_FAILED,
        (error as Error).message,
        error,
      );
    }
  } catch {
    // Ignore - proceed to unknown error handling
  }

  // Unknown errors
  const message = error instanceof Error ? error.message : "Unknown error";
  return new AppError(ErrorCode.UNKNOWN, message, error);
}
