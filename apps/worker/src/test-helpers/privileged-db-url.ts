import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseDotenv(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.replace(/\r$/, "").trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (key) {
      vars[key] = value;
    }
  }
  return vars;
}

export function getPrivilegedUrl(): string {
  if (process.env.PURGE_DATABASE_URL?.trim()) {
    return process.env.PURGE_DATABASE_URL;
  }

  const envPath = resolve(process.cwd(), "../../.env");
  try {
    const vars = parseDotenv(readFileSync(envPath, "utf-8"));

    const migrationsUrlFromFile = vars.DATABASE_URL_MIGRATIONS;
    if (migrationsUrlFromFile?.trim()) {
      return migrationsUrlFromFile;
    }

    const runtimeUrlFromFile = vars.DATABASE_URL;
    const migrateUser = vars.QS_DB_MIGRATE_USER;
    const migratePassword = vars.QS_DB_MIGRATE_PASSWORD;
    if (runtimeUrlFromFile?.trim() && migrateUser && migratePassword) {
      const url = new URL(runtimeUrlFromFile);
      url.username = migrateUser;
      url.password = migratePassword;
      return url.toString();
    }

    if (runtimeUrlFromFile?.trim()) {
      return runtimeUrlFromFile;
    }
  } catch {
    // .env doesn't exist (CI) — fall through
  }

  const migrationsUrl = process.env.DATABASE_URL_MIGRATIONS;
  if (migrationsUrl?.trim()) {
    return migrationsUrl;
  }

  const runtimeUrl = process.env.DATABASE_URL;
  if (runtimeUrl?.trim()) {
    const migratePassword = process.env.QS_DB_MIGRATE_PASSWORD;
    if (migratePassword) {
      return runtimeUrl.replace(
        /\/\/[^@]+@/,
        `//qs_migrate:${migratePassword}@`,
      );
    }
  }

  throw new Error(
    "Cannot determine database connection for test cleanup. " +
      "Set PURGE_DATABASE_URL or ensure .env exists at the repo root.",
  );
}
