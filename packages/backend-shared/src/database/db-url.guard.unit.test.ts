import { afterEach, describe, expect, it } from "vitest";

import {
  assertSafeRuntimeDatabaseRole,
  assertSafeRuntimeDatabaseUrl,
} from "./db-url.guard";

const originalNodeEnv = process.env.NODE_ENV;
const originalMigrateUser = process.env.QS_DB_MIGRATE_USER;
const originalPgUser = process.env.PGUSER;
const originalPostgresUser = process.env.POSTGRES_USER;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalMigrateUser === undefined) {
    delete process.env.QS_DB_MIGRATE_USER;
  } else {
    process.env.QS_DB_MIGRATE_USER = originalMigrateUser;
  }
  if (originalPgUser === undefined) {
    delete process.env.PGUSER;
  } else {
    process.env.PGUSER = originalPgUser;
  }
  if (originalPostgresUser === undefined) {
    delete process.env.POSTGRES_USER;
  } else {
    process.env.POSTGRES_USER = originalPostgresUser;
  }
});

describe("assertSafeRuntimeDatabaseUrl", () => {
  it("throws in production when DATABASE_URL uses qs_migrate", () => {
    process.env.NODE_ENV = "production";
    delete process.env.QS_DB_MIGRATE_USER;

    expect(() =>
      assertSafeRuntimeDatabaseUrl(
        "postgres://qs_migrate:pass@localhost:5432/qs_pro",
      ),
    ).toThrow(/DATABASE_URL user 'qs_migrate'/);
  });

  it("does not throw in production when DATABASE_URL uses a runtime role", () => {
    process.env.NODE_ENV = "production";

    expect(() =>
      assertSafeRuntimeDatabaseUrl(
        "postgres://qs_runtime:pass@localhost:5432/qs_pro",
      ),
    ).not.toThrow();
  });

  it("does not throw outside production", () => {
    process.env.NODE_ENV = "development";

    expect(() =>
      assertSafeRuntimeDatabaseUrl(
        "postgres://qs_migrate:pass@localhost:5432/qs_pro",
      ),
    ).not.toThrow();
  });

  it("uses QS_DB_MIGRATE_USER when provided", () => {
    process.env.NODE_ENV = "production";
    process.env.QS_DB_MIGRATE_USER = "custom_migrate";

    expect(() =>
      assertSafeRuntimeDatabaseUrl(
        "postgres://custom_migrate:pass@localhost:5432/qs_pro",
      ),
    ).toThrow(/DATABASE_URL user 'custom_migrate'/);
  });

  it("throws in production when connection string cannot be parsed", () => {
    process.env.NODE_ENV = "production";

    expect(() => assertSafeRuntimeDatabaseUrl("not-a-url")).toThrow(
      /unparseable DATABASE_URL/i,
    );
  });

  it("throws in production when DATABASE_URL has no username", () => {
    process.env.NODE_ENV = "production";
    delete process.env.PGUSER;
    delete process.env.POSTGRES_USER;

    expect(() =>
      assertSafeRuntimeDatabaseUrl("postgres://localhost:5432/qs_pro"),
    ).toThrow(/explicit DATABASE_URL user/i);
  });

  it("uses PGUSER when DATABASE_URL has no username", () => {
    process.env.NODE_ENV = "production";
    process.env.PGUSER = "qs_runtime";

    expect(() =>
      assertSafeRuntimeDatabaseUrl("postgres://localhost:5432/qs_pro"),
    ).not.toThrow();
  });

  it.each([
    "postgres",
    "admin",
    "root",
    "superuser",
    "rdsadmin",
    "cloudsqladmin",
    "azure_superuser",
    "POSTGRES", // case insensitive
    "Admin",
  ])("throws in production when DATABASE_URL uses superuser '%s'", (user) => {
    process.env.NODE_ENV = "production";

    expect(() =>
      assertSafeRuntimeDatabaseUrl(
        `postgres://${user}:pass@localhost:5432/qs_pro`,
      ),
    ).toThrow(/Superuser\/admin roles bypass row-level security/);
  });
});

describe("assertSafeRuntimeDatabaseRole", () => {
  type RoleFlags = { rolsuper: boolean | null; rolbypassrls: boolean | null };
  type MembershipResult = { rolname: string };

  function createMockSql(
    roleFlags: RoleFlags[],
    membershipResults: MembershipResult[] = [],
  ) {
    let callCount = 0;
    return (() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(roleFlags);
      }
      return Promise.resolve(membershipResults);
    }) as unknown as Parameters<typeof assertSafeRuntimeDatabaseRole>[0];
  }

  it("does not throw outside production", async () => {
    process.env.NODE_ENV = "development";

    const mockSql = createMockSql([{ rolsuper: true, rolbypassrls: true }]);

    await expect(
      assertSafeRuntimeDatabaseRole(mockSql),
    ).resolves.toBeUndefined();
  });

  it("does not throw in production when role has no privileged flags and no privileged membership", async () => {
    process.env.NODE_ENV = "production";

    const mockSql = createMockSql(
      [{ rolsuper: false, rolbypassrls: false }],
      [],
    );

    await expect(
      assertSafeRuntimeDatabaseRole(mockSql),
    ).resolves.toBeUndefined();
  });

  it("throws in production when role has SUPERUSER", async () => {
    process.env.NODE_ENV = "production";

    const mockSql = createMockSql([{ rolsuper: true, rolbypassrls: false }]);

    await expect(assertSafeRuntimeDatabaseRole(mockSql)).rejects.toThrow(
      /privileged DATABASE_URL role.*SUPERUSER or BYPASSRLS/,
    );
  });

  it("throws in production when role has BYPASSRLS", async () => {
    process.env.NODE_ENV = "production";

    const mockSql = createMockSql([{ rolsuper: false, rolbypassrls: true }]);

    await expect(assertSafeRuntimeDatabaseRole(mockSql)).rejects.toThrow(
      /privileged DATABASE_URL role.*SUPERUSER or BYPASSRLS/,
    );
  });

  it("throws in production when role has both SUPERUSER and BYPASSRLS", async () => {
    process.env.NODE_ENV = "production";

    const mockSql = createMockSql([{ rolsuper: true, rolbypassrls: true }]);

    await expect(assertSafeRuntimeDatabaseRole(mockSql)).rejects.toThrow(
      /privileged DATABASE_URL role.*SUPERUSER or BYPASSRLS/,
    );
  });

  it("throws in production when role lookup returns empty result", async () => {
    process.env.NODE_ENV = "production";

    const mockSql = createMockSql([]);

    await expect(assertSafeRuntimeDatabaseRole(mockSql)).rejects.toThrow(
      /unable to verify database role privileges/,
    );
  });

  it("throws in production when role is member of a privileged role", async () => {
    process.env.NODE_ENV = "production";

    const mockSql = createMockSql(
      [{ rolsuper: false, rolbypassrls: false }],
      [{ rolname: "admin_group" }],
    );

    await expect(assertSafeRuntimeDatabaseRole(mockSql)).rejects.toThrow(
      /member of privileged role 'admin_group'/,
    );
  });
});
