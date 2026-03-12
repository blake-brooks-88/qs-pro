import { afterEach, describe, expect, it } from "vitest";

import {
  assertSafeBackofficeDatabaseRole,
  assertSafeBackofficeDatabaseUrl,
  assertSafeRuntimeDatabaseRole,
  assertSafeRuntimeDatabaseUrl,
} from "./db-url.guard";

const originalNodeEnv = process.env.NODE_ENV;
const originalMigrateUser = process.env.QS_DB_MIGRATE_USER;
const originalBackofficeUser = process.env.QS_DB_BACKOFFICE_USER;
const originalPgUser = process.env.PGUSER;
const originalPostgresUser = process.env.POSTGRES_USER;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalMigrateUser === undefined) {
    delete process.env.QS_DB_MIGRATE_USER;
  } else {
    process.env.QS_DB_MIGRATE_USER = originalMigrateUser;
  }
  if (originalBackofficeUser === undefined) {
    delete process.env.QS_DB_BACKOFFICE_USER;
  } else {
    process.env.QS_DB_BACKOFFICE_USER = originalBackofficeUser;
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

describe("assertSafeBackofficeDatabaseUrl", () => {
  it("throws in production when DATABASE_URL_BACKOFFICE uses qs_migrate", () => {
    process.env.NODE_ENV = "production";
    delete process.env.QS_DB_MIGRATE_USER;

    expect(() =>
      assertSafeBackofficeDatabaseUrl(
        "postgres://qs_migrate:pass@localhost:5432/qs_pro",
      ),
    ).toThrow(/DATABASE_URL_BACKOFFICE user 'qs_migrate'/);
  });

  it("throws in production when DATABASE_URL_BACKOFFICE uses qs_runtime", () => {
    process.env.NODE_ENV = "production";

    expect(() =>
      assertSafeBackofficeDatabaseUrl(
        "postgres://qs_runtime:pass@localhost:5432/qs_pro",
      ),
    ).toThrow(/Expected the dedicated backoffice role 'qs_backoffice'/);
  });

  it("does not throw in production when DATABASE_URL_BACKOFFICE uses qs_backoffice", () => {
    process.env.NODE_ENV = "production";

    expect(() =>
      assertSafeBackofficeDatabaseUrl(
        "postgres://qs_backoffice:pass@localhost:5432/qs_pro",
      ),
    ).not.toThrow();
  });

  it("uses QS_DB_BACKOFFICE_USER when provided", () => {
    process.env.NODE_ENV = "production";
    process.env.QS_DB_BACKOFFICE_USER = "custom_backoffice";

    expect(() =>
      assertSafeBackofficeDatabaseUrl(
        "postgres://custom_backoffice:pass@localhost:5432/qs_pro",
      ),
    ).not.toThrow();
  });

  it.each(["postgres", "rdsadmin"])(
    "throws in production when DATABASE_URL_BACKOFFICE uses superuser '%s'",
    (user) => {
      process.env.NODE_ENV = "production";

      expect(() =>
        assertSafeBackofficeDatabaseUrl(
          `postgres://${user}:pass@localhost:5432/qs_pro`,
        ),
      ).toThrow(/Superuser\/admin roles are never acceptable/);
    },
  );
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

describe("assertSafeBackofficeDatabaseRole", () => {
  type RoleFlags = {
    rolsuper: boolean | null;
    rolbypassrls: boolean | null;
    rolcreatedb: boolean | null;
    rolcreaterole: boolean | null;
    rolreplication: boolean | null;
  };
  type MembershipResult = {
    rolname: string;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
  };

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
    }) as unknown as Parameters<typeof assertSafeBackofficeDatabaseRole>[0];
  }

  it("does not throw outside production", async () => {
    process.env.NODE_ENV = "development";

    const mockSql = createMockSql([
      {
        rolsuper: true,
        rolbypassrls: false,
        rolcreatedb: true,
        rolcreaterole: true,
        rolreplication: true,
      },
    ]);

    await expect(
      assertSafeBackofficeDatabaseRole(mockSql),
    ).resolves.toBeUndefined();
  });

  it("does not throw in production when role is BYPASSRLS-only and has no privileged membership", async () => {
    process.env.NODE_ENV = "production";

    const mockSql = createMockSql(
      [
        {
          rolsuper: false,
          rolbypassrls: true,
          rolcreatedb: false,
          rolcreaterole: false,
          rolreplication: false,
        },
      ],
      [],
    );

    await expect(
      assertSafeBackofficeDatabaseRole(mockSql),
    ).resolves.toBeUndefined();
  });

  it("throws in production when role is not BYPASSRLS", async () => {
    process.env.NODE_ENV = "production";

    const mockSql = createMockSql([
      {
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
      },
    ]);

    await expect(assertSafeBackofficeDatabaseRole(mockSql)).rejects.toThrow(
      /must have BYPASSRLS enabled/i,
    );
  });

  it("throws in production when role has SUPERUSER", async () => {
    process.env.NODE_ENV = "production";

    const mockSql = createMockSql([
      {
        rolsuper: true,
        rolbypassrls: true,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
      },
    ]);

    await expect(assertSafeBackofficeDatabaseRole(mockSql)).rejects.toThrow(
      /must not be SUPERUSER/i,
    );
  });

  it("throws in production when role has CREATEDB/CREATEROLE/REPLICATION", async () => {
    process.env.NODE_ENV = "production";

    const mockSql = createMockSql([
      {
        rolsuper: false,
        rolbypassrls: true,
        rolcreatedb: true,
        rolcreaterole: false,
        rolreplication: false,
      },
    ]);

    await expect(assertSafeBackofficeDatabaseRole(mockSql)).rejects.toThrow(
      /must not have CREATEDB\/CREATEROLE\/REPLICATION/i,
    );
  });

  it("throws in production when role lookup returns empty result", async () => {
    process.env.NODE_ENV = "production";

    const mockSql = createMockSql([]);

    await expect(assertSafeBackofficeDatabaseRole(mockSql)).rejects.toThrow(
      /unable to verify database role privileges/i,
    );
  });

  it("throws in production when role is member of a privileged role", async () => {
    process.env.NODE_ENV = "production";

    const mockSql = createMockSql(
      [
        {
          rolsuper: false,
          rolbypassrls: true,
          rolcreatedb: false,
          rolcreaterole: false,
          rolreplication: false,
        },
      ],
      [
        {
          rolname: "admin_group",
          rolsuper: true,
          rolcreatedb: false,
          rolcreaterole: false,
          rolreplication: false,
        },
      ],
    );

    await expect(assertSafeBackofficeDatabaseRole(mockSql)).rejects.toThrow(
      /member of privileged role 'admin_group'/,
    );
  });
});
