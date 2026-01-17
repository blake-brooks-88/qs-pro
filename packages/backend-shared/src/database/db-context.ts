import { AsyncLocalStorage } from "node:async_hooks";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

type DbContextStore = {
  db: PostgresJsDatabase<Record<string, unknown>>;
  reservedSql?: Sql;
};

const storage = new AsyncLocalStorage<DbContextStore>();

export function runWithDbContext<T>(
  db: PostgresJsDatabase<Record<string, unknown>>,
  fn: () => T,
  reservedSql?: Sql,
): T {
  return storage.run({ db, reservedSql }, fn);
}

export function enterWithDbContext(
  db: PostgresJsDatabase<Record<string, unknown>>,
  reservedSql?: Sql,
): void {
  storage.enterWith({ db, reservedSql });
}

export function getDbFromContext():
  | PostgresJsDatabase<Record<string, unknown>>
  | undefined {
  return storage.getStore()?.db;
}

export function getReservedSqlFromContext(): Sql | undefined {
  return storage.getStore()?.reservedSql;
}
