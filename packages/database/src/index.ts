import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export const createDatabase = (connectionString: string) => {
  const client = postgres(connectionString);
  return drizzle(client);
};

export const createSqlClient = (connectionString: string) =>
  postgres(connectionString);

export const createDatabaseFromClient = (client: ReturnType<typeof postgres>) =>
  drizzle(client);

export * from "./crypto";
export * from "./errors";
export * from "./interfaces";
export * from "./repositories/drizzle-repositories";
export * from "./schema";
export * from "drizzle-orm";
export type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
