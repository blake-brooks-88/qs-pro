import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrivilegedUrl } from "../privileged-db-url";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

const mockReadFileSync = vi.mocked(readFileSync);

describe("getPrivilegedUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockReadFileSync.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns PURGE_DATABASE_URL when set", () => {
    process.env.PURGE_DATABASE_URL = "postgres://purge:pass@db/purge";

    expect(getPrivilegedUrl()).toBe("postgres://purge:pass@db/purge");
  });

  it("prefers DATABASE_URL_MIGRATIONS from .env file when available", () => {
    mockReadFileSync.mockReturnValueOnce(
      "DATABASE_URL_MIGRATIONS=postgres://migrate:pass@db/migrate\n",
    );

    expect(getPrivilegedUrl()).toBe("postgres://migrate:pass@db/migrate");
  });

  it("builds a privileged URL from runtime DATABASE_URL + migrate credentials in .env", () => {
    mockReadFileSync.mockReturnValueOnce(
      [
        "DATABASE_URL=postgres://runtime:runtimepass@db/runtime",
        "QS_DB_MIGRATE_USER=qs_migrate",
        "QS_DB_MIGRATE_PASSWORD=secret",
        "",
      ].join("\n"),
    );

    expect(getPrivilegedUrl()).toBe("postgres://qs_migrate:secret@db/runtime");
  });

  it("falls back to DATABASE_URL from .env file when that is all that exists", () => {
    mockReadFileSync.mockReturnValueOnce(
      "DATABASE_URL=postgres://runtime:runtimepass@db/runtime\n",
    );

    expect(getPrivilegedUrl()).toBe("postgres://runtime:runtimepass@db/runtime");
  });

  it("uses DATABASE_URL_MIGRATIONS env var when .env file is missing", () => {
    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error("missing");
    });
    process.env.DATABASE_URL_MIGRATIONS = "postgres://migrate:pass@db/migrate";

    expect(getPrivilegedUrl()).toBe("postgres://migrate:pass@db/migrate");
  });

  it("injects migrate password into DATABASE_URL env var as a last resort", () => {
    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error("missing");
    });
    process.env.DATABASE_URL = "postgres://runtime:runtimepass@db/runtime";
    process.env.QS_DB_MIGRATE_PASSWORD = "secret";

    expect(getPrivilegedUrl()).toBe("postgres://qs_migrate:secret@db/runtime");
  });

  it("throws a helpful error when no DB URL can be determined", () => {
    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error("missing");
    });
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_MIGRATIONS;

    expect(() => getPrivilegedUrl()).toThrow(/Cannot determine database connection/i);
  });
});

