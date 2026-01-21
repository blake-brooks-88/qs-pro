/**
 * Pre-approved validation violation messages.
 * These ARE exposed to clients via RFC 9457 extensions - all text here is audited.
 *
 * SECURITY: Only add messages that are safe for client consumption.
 * Never include internal identifiers, paths, or implementation details.
 */
export const ValidationViolations = {
  PROHIBITED_DELETE: "DELETE statement not allowed",
  PROHIBITED_INSERT: "INSERT statement not allowed",
  PROHIBITED_UPDATE: "UPDATE statement not allowed",
  PROHIBITED_DROP: "DROP statement not allowed",
  PROHIBITED_TRUNCATE: "TRUNCATE statement not allowed",
  PROHIBITED_EXEC: "EXEC statement not allowed",
  PROHIBITED_CREATE: "CREATE statement not allowed",
  PROHIBITED_ALTER: "ALTER statement not allowed",
  SELECT_STAR_NOT_EXPANDABLE: "SELECT * could not be expanded for this table",
  MISSING_FROM_CLAUSE: "Query must include a FROM clause",
  INVALID_SYNTAX: "Query contains invalid SQL syntax",
} as const;

export type ValidationViolation =
  (typeof ValidationViolations)[keyof typeof ValidationViolations];
