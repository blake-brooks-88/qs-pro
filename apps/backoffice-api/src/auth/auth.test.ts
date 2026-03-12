import { afterEach, describe, expect, it, vi } from "vitest";

const postgresMock = vi.fn(() => ({}));
vi.mock("postgres", () => ({ default: postgresMock }));

const drizzleMock = vi.fn(() => ({}));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: drizzleMock }));

const drizzleAdapterMock = vi.fn(() => ({ adapter: "drizzle" }));
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: drizzleAdapterMock }));

const adminPluginMock = vi.fn(() => ({ plugin: "admin" }));
const twoFactorPluginMock = vi.fn(() => ({ plugin: "twoFactor" }));
vi.mock("better-auth/plugins", () => ({
  admin: adminPluginMock,
  twoFactor: twoFactorPluginMock,
}));

const betterAuthMock = vi.fn(() => ({ api: {}, handler: vi.fn() }));
vi.mock("better-auth", () => ({ betterAuth: betterAuthMock }));

const assertSafeBackofficeDatabaseUrlMock = vi.fn();
vi.mock("@qpp/backend-shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qpp/backend-shared")>();
  return { ...actual, assertSafeBackofficeDatabaseUrl: assertSafeBackofficeDatabaseUrlMock };
});

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return fn().finally(() => {
    process.env = previous;
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("auth (Better Auth config)", () => {
  it("throws when DATABASE_URL_BACKOFFICE is missing", async () => {
    await withEnv(
      {
        DATABASE_URL_BACKOFFICE: undefined,
        BETTER_AUTH_SECRET: "test-secret",
      },
      async () => {
        vi.resetModules();
        await expect(import("./auth.js")).rejects.toThrow(
          "DATABASE_URL_BACKOFFICE is required",
        );
      },
    );
  });

  it("throws when BETTER_AUTH_SECRET is missing", async () => {
    await withEnv(
      {
        DATABASE_URL_BACKOFFICE: "postgres://user:pass@localhost:5432/db",
        BETTER_AUTH_SECRET: undefined,
      },
      async () => {
        vi.resetModules();
        await expect(import("./auth.js")).rejects.toThrow(
          "BETTER_AUTH_SECRET is required",
        );
      },
    );
  });

  it("builds the Better Auth instance from env", async () => {
    await withEnv(
      {
        DATABASE_URL_BACKOFFICE: "postgres://user:pass@localhost:5432/db",
        BETTER_AUTH_SECRET: "test-secret",
        BACKOFFICE_WEB_ORIGIN: "https://backoffice.example.com",
      },
      async () => {
        vi.resetModules();
        await import("./auth.js");

        expect(assertSafeBackofficeDatabaseUrlMock).toHaveBeenCalledWith(
          "postgres://user:pass@localhost:5432/db",
        );

        expect(betterAuthMock).toHaveBeenCalledTimes(1);
        const config = betterAuthMock.mock.calls[0]?.[0] as Record<string, unknown>;

        expect(config).toMatchObject({
          appName: "QS Pro Backoffice",
          secret: "test-secret",
          basePath: "/api/auth",
          trustedOrigins: ["https://backoffice.example.com"],
        });

        expect(adminPluginMock).toHaveBeenCalledWith({
          defaultRole: "viewer",
          adminRoles: ["admin"],
        });
        expect(twoFactorPluginMock).toHaveBeenCalledWith({
          issuer: "QS Pro Backoffice",
        });
      },
    );
  });
});

