# PostgreSQL Roles (QS Pro)

This runbook documents the intended PostgreSQL role boundaries in QS Pro and the guardrails that enforce them.

## Roles

### `qs_runtime` (main API runtime)

- **Purpose:** Customer-facing API runtime role.
- **RLS:** **Enforced** (must not have `BYPASSRLS`).
- **Access model:** Broad tenant-table CRUD as required by the main app, but **no access** to backoffice auth/session tables (`bo_*`) or `backoffice_audit_logs`.
- **Guardrail:** `@qpp/backend-shared` refuses to start in production if `DATABASE_URL` is `SUPERUSER` or `BYPASSRLS`.

### `qs_migrate` (migrations / CI cleanup)

- **Purpose:** Schema migrations and test/CI cleanup only.
- **RLS:** **Bypassed** (`BYPASSRLS`) because some tables use `FORCE ROW LEVEL SECURITY`.
- **Access model:** Owns/creates schema objects; never used for app runtime.

### `qs_backoffice` (backoffice runtime)

- **Purpose:** Backoffice/admin portal runtime role.
- **RLS:** **Bypassed** (`BYPASSRLS`) by design; backoffice is cross-tenant and does not set tenant context (`app.tenant_id`/`app.mid`).
- **Security boundary:** **Table-level `GRANT` allowlist** only.
  - No “future table” permissions (`ALTER DEFAULT PRIVILEGES`) for tables.
  - Add/remove access via explicit `GRANT`/`REVOKE` in a Drizzle SQL migration.
- **Guardrail:** Backoffice refuses to start in production unless it connects using the expected backoffice role (and the role is `BYPASSRLS` but not superuser).

## Where permissions live

- **Role creation (dev Docker):** `docker/postgres/init/001-create-roles.sh`
- **Table-level allowlist + revokes:** `packages/database/drizzle/0038_backoffice_role_separation.sql` (and follow-up migrations)

## Changing backoffice access safely

When you add a new table that backoffice needs:

1. Create a new Drizzle SQL migration that:
   - `GRANT`s only the required operations on the new table(s) to `qs_backoffice`
   - `REVOKE`s any accidental access from `qs_runtime` (if applicable)
2. Add a verification snippet to the plan or runbook (psql `SELECT 1 ... LIMIT 1` and a denied write).

Avoid:

- `ALTER DEFAULT PRIVILEGES ... GRANT ... TO qs_backoffice` for tables (it is easy to unintentionally expand scope).
- Using `qs_migrate` or an admin/superuser role as an app runtime credential.

## Environment variables

- Main API: `DATABASE_URL` should use `qs_runtime`
- Migrations/CI: `DATABASE_URL_MIGRATIONS` should use `qs_migrate`
- Backoffice: `DATABASE_URL_BACKOFFICE` should use `qs_backoffice`

