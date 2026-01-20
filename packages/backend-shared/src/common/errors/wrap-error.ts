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

  // Unknown errors
  const message = error instanceof Error ? error.message : "Unknown error";
  return new AppError(ErrorCode.UNKNOWN, message, error);
}
