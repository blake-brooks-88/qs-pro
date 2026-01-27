import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getDbFromContext } from "../database/db-context";

/**
 * Get database from RLS context with assertion.
 * Throws if called outside of runWithTenantContext.
 */
export function getContextDb(): PostgresJsDatabase<Record<string, unknown>> {
  const db = getDbFromContext();
  if (!db) {
    throw new Error(
      "Database context not available - are you inside runWithTenantContext?",
    );
  }
  return db;
}
