import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { SessionGuard } from "./session.guard";

type TestSession = {
  get: (key: string) => unknown;
};

function createContext(request: { session?: TestSession }) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as never;
}

describe("SessionGuard", () => {
  it("throws 401 when no session exists on request", () => {
    const guard = new SessionGuard();

    expect(() => guard.canActivate(createContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects non-string session values", () => {
    const guard = new SessionGuard();
    const session: TestSession = {
      get: (key) => {
        if (key === "userId") {
          return 123;
        }
        if (key === "tenantId") {
          return "tenant-1";
        }
        if (key === "mid") {
          return "mid-1";
        }
        return undefined;
      },
    };

    expect(() => guard.canActivate(createContext({ session }))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects empty session values", () => {
    const guard = new SessionGuard();
    const session: TestSession = {
      get: (key) => {
        if (key === "userId") {
          return "";
        }
        if (key === "tenantId") {
          return "tenant-1";
        }
        if (key === "mid") {
          return "mid-1";
        }
        return undefined;
      },
    };

    expect(() => guard.canActivate(createContext({ session }))).toThrow(
      UnauthorizedException,
    );
  });

  it("decorates request.user with { userId, tenantId, mid }", () => {
    const guard = new SessionGuard();
    const request: { session?: TestSession; user?: unknown } = {};

    request.session = {
      get: (key) => {
        if (key === "userId") {
          return "user-1";
        }
        if (key === "tenantId") {
          return "tenant-1";
        }
        if (key === "mid") {
          return "mid-1";
        }
        return undefined;
      },
    };

    const allowed = guard.canActivate(createContext(request));

    expect(allowed).toBe(true);
    expect(request.user).toEqual({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
    });
  });
});
