export const QUERY_CUSTOMER_KEY_PREFIX = "QPP_Query_";
export const MCE_CUSTOMER_KEY_MAX_LENGTH = 36;

/**
 * Build Query Activity customer key for a user.
 * Query Activities are reused per user - same key = same activity gets updated.
 *
 * Pattern matches Query Studio's "InteractiveQuery" per user approach.
 */
export function buildQueryCustomerKey(userId: string): string {
  const maxIdLength =
    MCE_CUSTOMER_KEY_MAX_LENGTH - QUERY_CUSTOMER_KEY_PREFIX.length;
  return `${QUERY_CUSTOMER_KEY_PREFIX}${userId.substring(0, maxIdLength)}`;
}
