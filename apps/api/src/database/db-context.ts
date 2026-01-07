import { AsyncLocalStorage } from 'node:async_hooks';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

type DbContextStore = {
  db: PostgresJsDatabase<any>;
};

const storage = new AsyncLocalStorage<DbContextStore>();

export function runWithDbContext<T>(
  db: PostgresJsDatabase<any>,
  fn: () => T,
): T {
  return storage.run({ db }, fn);
}

export function enterWithDbContext(db: PostgresJsDatabase<any>): void {
  storage.enterWith({ db });
}

export function getDbFromContext(): PostgresJsDatabase<any> | undefined {
  return storage.getStore()?.db;
}
