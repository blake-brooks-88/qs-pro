import { ErrorCode } from "@qpp/shared-types";

/**
 * Database-layer error that carries an ErrorCode.
 *
 * This allows errors to propagate to the service layer with proper
 * classification while avoiding circular dependencies (database
 * cannot import AppError from backend-shared).
 *
 * The toAppError utility in backend-shared detects this error type
 * and converts it to AppError with the appropriate code.
 */
export class DatabaseError extends Error {
  override readonly name = "DatabaseError";

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly context?: Record<string, unknown>,
  ) {
    super(message);
  }
}
