import { DatabaseError } from "@qpp/database";

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

  // Convert DatabaseError to AppError with the appropriate code
  if (error instanceof DatabaseError) {
    return new AppError(error.code, error, error.context);
  }

  // Wrap unknown errors with UNKNOWN code
  // Original error preserved as cause for logging
  return new AppError(ErrorCode.UNKNOWN, error);
}
