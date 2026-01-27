/**
 * MCE Operation HTTP Timeout Configuration
 *
 * Operation-type-specific timeouts to prevent hung requests.
 * Axios defaults to 0 (no timeout), which causes requests to hang
 * indefinitely on network issues.
 *
 * @see CONTEXT.md "HTTP Timeouts (Priority 2)" for rationale
 * @see https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/api-performance.html
 */
export const MCE_TIMEOUTS = {
  /** Metadata calls: Describe, Retrieve small datasets. Should be fast; fail fast if not. */
  METADATA: 30_000,

  /** Queue job: Perform operation that just queues (doesn't wait for execution). */
  QUEUE_JOB: 30_000,

  /** Status polling: AsyncActivityStatus checks. Quick check. */
  STATUS_POLL: 30_000,

  /** Large data retrieval: May return significant row counts. */
  DATA_RETRIEVAL: 120_000,

  /** Default fallback for unspecified operations. */
  DEFAULT: 30_000,
} as const;

export type MceOperationType = keyof typeof MCE_TIMEOUTS;
