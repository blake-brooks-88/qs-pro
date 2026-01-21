import { ErrorCode } from "./error-codes";
import { ErrorMessages } from "./error-messages";

/**
 * Extension data for RFC 9457 Problem Details.
 * These fields ARE exposed to clients - must be safe.
 */
export interface AppErrorExtensions {
  /** Validation violations (for MCE_VALIDATION_FAILED) */
  violations?: string[];
  /** Field that caused the error */
  field?: string;
  /** Retry-after in seconds (for RATE_LIMIT_EXCEEDED) */
  retryAfter?: number;
}

/**
 * Centralized error class for application domain errors.
 *
 * Message is automatically derived from error code to ensure:
 * - Consistent client-facing text
 * - No accidental information disclosure
 * - All messages auditable in error-messages.ts
 *
 * @param code - Error code from ErrorCode enum
 * @param cause - Original error for error chaining (logged server-side)
 * @param context - Debugging context (logged server-side, NEVER exposed to client)
 * @param extensions - RFC 9457 extension fields (exposed to client, must be safe)
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly cause?: unknown,
    readonly context?: Record<string, unknown>,
    readonly extensions?: AppErrorExtensions,
  ) {
    super(ErrorMessages[code]);
    this.name = "AppError";
  }
}
