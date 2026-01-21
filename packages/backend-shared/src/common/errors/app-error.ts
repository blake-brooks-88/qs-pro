import { ErrorCode } from "./error-codes";
import { ErrorMessages } from "./error-messages";

/**
 * Debugging context for error tracing. Logged server-side, NEVER exposed to clients.
 *
 * Contains two categories of data:
 * 1. Correlation IDs (tenantId, userId, mid, runId, mceRequestId) - always safe to log
 * 2. Operational details (operation, status, statusMessage) - may include upstream
 *    service messages that could contain object names or account identifiers
 *
 * Current logging policy: entire context logged at WARN level for debugging.
 * If log aggregation is added later, consider selective logging by category.
 */
export interface ErrorContext {
  // Correlation IDs - safe to log, use for tracing
  tenantId?: string;
  userId?: string;
  mid?: string;
  runId?: string;
  mceRequestId?: string;

  // Operational details - may include upstream service messages
  operation?: string;
  status?: string;
  statusMessage?: string;
  maxPages?: number;
}

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
    readonly context?: ErrorContext,
    readonly extensions?: AppErrorExtensions,
  ) {
    super(ErrorMessages[code]);
    this.name = "AppError";
  }
}
