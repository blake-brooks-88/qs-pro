import type { Sql } from "postgres";

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

/**
 * Verifies the runtime database role cannot bypass row-level security.
 *
 * Checks SUPERUSER and BYPASSRLS only—these directly defeat RLS. Other flags
 * like CREATEROLE/CREATEDB are privilege escalation vectors but don't bypass
 * RLS directly; CI validates the complete role configuration.
 */
export async function assertSafeRuntimeDatabaseRole(sql: Sql): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const rows = await sql<
    Array<{ rolsuper: boolean | null; rolbypassrls: boolean | null }>
  >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  const row = rows[0];
  if (!row) {
    throw new Error(
      "Refusing to start in production: unable to verify database role privileges for current_user.",
    );
  }

  if (row.rolsuper || row.rolbypassrls) {
    throw new Error(
      "Refusing to start in production with a privileged DATABASE_URL role (SUPERUSER or BYPASSRLS). " +
        "Use a dedicated runtime role with RLS enforced (e.g. qs_runtime) and reserve privileged roles for migrations/maintenance only.",
    );
  }

  const privilegedMembership = await sql<Array<{ rolname: string }>>`
    WITH RECURSIVE role_path AS (
      SELECT oid, rolname, rolsuper, rolbypassrls
      FROM pg_roles
      WHERE rolname = current_user
      UNION
      SELECT r.oid, r.rolname, r.rolsuper, r.rolbypassrls
      FROM pg_roles r
      JOIN pg_auth_members am ON r.oid = am.roleid
      JOIN role_path rp ON am.member = rp.oid
    )
    SELECT rolname FROM role_path
    WHERE (rolsuper OR rolbypassrls) AND rolname != current_user
    LIMIT 1
  `;

  const inheritedPrivilegedRole = privilegedMembership[0];
  if (inheritedPrivilegedRole) {
    throw new Error(
      `Refusing to start in production: runtime role is a member of privileged role '${inheritedPrivilegedRole.rolname}' (SUPERUSER or BYPASSRLS). ` +
        "Revoke this membership to prevent privilege escalation via SET ROLE.",
    );
  }
}
