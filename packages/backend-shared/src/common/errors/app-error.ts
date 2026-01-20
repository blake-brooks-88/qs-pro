import { ErrorCode } from "./error-codes";

/**
 * Centralized error class for application domain errors.
 * All domain errors should be thrown as AppError with appropriate ErrorCode.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}
