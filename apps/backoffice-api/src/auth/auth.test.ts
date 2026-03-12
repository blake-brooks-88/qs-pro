import { describe, expect, it } from "vitest";

import { getBackofficeAuthConfigFromEnv } from "./auth.js";

describe("getBackofficeAuthConfigFromEnv", () => {
  it("throws when DATABASE_URL_BACKOFFICE is missing", () => {
    expect(() =>
      getBackofficeAuthConfigFromEnv({
        BETTER_AUTH_SECRET: "secret",
      }),
    ).toThrowError("DATABASE_URL_BACKOFFICE is required");
  });

  it("throws when BETTER_AUTH_SECRET is missing", () => {
    expect(() =>
      getBackofficeAuthConfigFromEnv({
        DATABASE_URL_BACKOFFICE: "postgres://user:pass@host:5432/db",
      }),
    ).toThrowError("BETTER_AUTH_SECRET is required");
  });

  it("uses BACKOFFICE_WEB_ORIGIN when present, otherwise defaults", () => {
    const withOrigin = getBackofficeAuthConfigFromEnv({
      DATABASE_URL_BACKOFFICE: "postgres://user:pass@host:5432/db",
      BETTER_AUTH_SECRET: "secret",
      BACKOFFICE_WEB_ORIGIN: "https://bo.example.com",
    });
    expect(withOrigin.trustedOrigins).toEqual(["https://bo.example.com"]);

    const withoutOrigin = getBackofficeAuthConfigFromEnv({
      DATABASE_URL_BACKOFFICE: "postgres://user:pass@host:5432/db",
      BETTER_AUTH_SECRET: "secret",
    });
    expect(withoutOrigin.trustedOrigins).toEqual(["http://localhost:5174"]);
  });
});

