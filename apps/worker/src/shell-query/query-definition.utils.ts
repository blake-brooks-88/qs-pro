export const QUERY_CUSTOMER_KEY_PREFIX = "QPP_Query_";
export const MCE_CUSTOMER_KEY_MAX_LENGTH = 36;

export function buildQueryCustomerKey(runId: string): string {
  const maxRunIdLength =
    MCE_CUSTOMER_KEY_MAX_LENGTH - QUERY_CUSTOMER_KEY_PREFIX.length;
  return `${QUERY_CUSTOMER_KEY_PREFIX}${runId.substring(0, maxRunIdLength)}`;
}
