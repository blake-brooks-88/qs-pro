import { AppError, isRetryable } from "../common/errors";

export interface RetryConfig {
  maxRetries?: number; // Default: 3
  baseDelayMs?: number; // Default: 1000
  maxDelayMs?: number; // Default: 8000
  jitterRange?: number; // Default: 0.4 (+-20%)
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  jitterRange: 0.4,
};

/**
 * Calculate retry delay with exponential backoff and jitter.
 * Respects Retry-After header if provided.
 */
export function calculateRetryDelay(
  attempt: number,
  retryAfterSeconds?: number,
  config: RetryConfig = {},
): number {
  const { baseDelayMs, maxDelayMs, jitterRange } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  // Respect server guidance
  if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  // Exponential backoff: 1s, 2s, 4s, 8s
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter to prevent thundering herd
  const jitter = 1 - jitterRange / 2 + Math.random() * jitterRange;
  return Math.floor(cappedDelay * jitter);
}

/**
 * Extract Retry-After header value in seconds.
 * Handles both numeric seconds and HTTP-date formats.
 */
export function parseRetryAfter(error: unknown): number | undefined {
  if (!(error instanceof AppError) || !error.cause) {
    return undefined;
  }
  // axios stores headers in error.response.headers
  const axiosError = error.cause as {
    response?: { headers?: Record<string, string> };
  };
  const retryAfter = axiosError.response?.headers?.["retry-after"];

  if (!retryAfter) {
    return undefined;
  }

  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds;
  }

  // HTTP-date format: parse and compute delta
  const date = Date.parse(retryAfter);
  if (!isNaN(date)) {
    const delta = Math.ceil((date - Date.now()) / 1000);
    return delta > 0 ? delta : undefined;
  }

  return undefined;
}

/**
 * Wrap an async function with retry logic for transient errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
): Promise<T> {
  const { maxRetries } = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if not retryable or max attempts reached
      if (!isRetryable(error) || attempt >= maxRetries) {
        throw error;
      }

      const retryAfter = parseRetryAfter(error);
      const delay = calculateRetryDelay(attempt, retryAfter, config);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
