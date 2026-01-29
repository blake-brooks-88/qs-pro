const DEFAULT_MIGRATIONS_USERNAME = "qs_migrate";

/**
 * Superuser/admin role names that should never be used for application runtime.
 * These roles typically have elevated privileges (SUPERUSER, BYPASSRLS, etc.)
 * that would defeat row-level security.
 */
const BLOCKED_SUPERUSER_NAMES = new Set([
  "postgres",
  "admin",
  "root",
  "superuser",
  "rdsadmin", // AWS RDS admin
  "cloudsqladmin", // GCP Cloud SQL admin
  "azure_superuser", // Azure Database for PostgreSQL
]);

function getPostgresUsername(url: URL): string | null {
  return url.username ? decodeURIComponent(url.username) : null;
}

export function assertSafeRuntimeDatabaseUrl(connectionString: string): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const migrationsUsername =
    process.env.QS_DB_MIGRATE_USER?.trim() || DEFAULT_MIGRATIONS_USERNAME;
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      "Refusing to start in production with an unparseable DATABASE_URL. " +
        "Provide a standard postgres://... URL with an explicit runtime user (e.g. qs_runtime).",
    );
  }

  const username =
    getPostgresUsername(url) ||
    process.env.PGUSER?.trim() ||
    process.env.POSTGRES_USER?.trim() ||
    null;

  if (!username) {
    throw new Error(
      "Refusing to start in production without an explicit DATABASE_URL user. " +
        "Set DATABASE_URL to include a dedicated runtime role (e.g. qs_runtime), or set PGUSER.",
    );
  }

  if (username === migrationsUsername) {
    throw new Error(
      `Refusing to start in production with DATABASE_URL user '${username}'. ` +
        `Use a runtime role for DATABASE_URL (e.g. 'qs_runtime'); reserve '${migrationsUsername}' for migrations/test cleanup only.`,
    );
  }

  if (BLOCKED_SUPERUSER_NAMES.has(username.toLowerCase())) {
    throw new Error(
      `Refusing to start in production with DATABASE_URL user '${username}'. ` +
        `Superuser/admin roles bypass row-level security. Use a dedicated runtime role (e.g. 'qs_runtime').`,
    );
  }
}
