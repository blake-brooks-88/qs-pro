import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/store/auth-store";
import { server } from "@/test/mocks/server";

import { getMe, loginWithJwt, type MeResponseDto } from "../auth";

describe("auth service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({
      user: null,
      tenant: null,
      csrfToken: null,
      isAuthenticated: false,
    });
  });

  describe("getMe()", () => {
    it("fetches and returns user/tenant data from /auth/me", async () => {
      const mockResponse: MeResponseDto = {
        user: {
          id: "user-123",
          sfUserId: "sf-456",
          email: "user@example.com",
          name: "Test User",
        },
        tenant: {
          id: "tenant-789",
          eid: "eid-abc",
          tssd: "mc.s1.exacttarget.com",
        },
        csrfToken: "csrf-token-xyz",
      };

      server.use(
        http.get("/api/auth/me", () => {
          return HttpResponse.json(mockResponse);
        }),
      );

      const result = await getMe();

      expect(result).toEqual(mockResponse);
      expect(result.user.id).toBe("user-123");
      expect(result.tenant.eid).toBe("eid-abc");
      expect(result.csrfToken).toBe("csrf-token-xyz");
    });

    it("returns user with null email and name when not provided", async () => {
      const mockResponse: MeResponseDto = {
        user: {
          id: "user-no-email",
          sfUserId: "sf-no-email",
          email: null,
          name: null,
        },
        tenant: {
          id: "tenant-1",
          eid: "eid-1",
          tssd: "tssd-1",
        },
        csrfToken: null,
      };

      server.use(
        http.get("/api/auth/me", () => {
          return HttpResponse.json(mockResponse);
        }),
      );

      const result = await getMe();

      expect(result.user.email).toBeNull();
      expect(result.user.name).toBeNull();
      expect(result.csrfToken).toBeNull();
    });

    it("throws on 401 unauthorized response", async () => {
      server.use(
        http.get("/api/auth/me", () => {
          return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
        }),
      );

      await expect(getMe()).rejects.toMatchObject({
        response: { status: 401 },
      });
    });

    it("throws on 500 server error", async () => {
      server.use(
        http.get("/api/auth/me", () => {
          return HttpResponse.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }),
      );

      await expect(getMe()).rejects.toMatchObject({
        response: { status: 500 },
      });
    });
  });

  describe("loginWithJwt()", () => {
    it("sends POST to /auth/login with JWT in body", async () => {
      let capturedBody: { jwt?: string } | null = null;
      let capturedHeaders: Record<string, string> = {};

      server.use(
        http.post("/api/auth/login", async ({ request }) => {
          capturedBody = (await request.json()) as { jwt?: string };
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json({ success: true });
        }),
      );

      // Set CSRF token for POST request
      useAuthStore.setState({ csrfToken: "csrf-login-token" });

      await loginWithJwt("my-jwt-token");

      expect(capturedBody).toEqual({ jwt: "my-jwt-token" });
      expect(capturedHeaders["accept"]).toBe("application/json");
      expect(capturedHeaders["x-csrf-token"]).toBe("csrf-login-token");
    });

    it("returns void on successful login", async () => {
      server.use(
        http.post("/api/auth/login", () => {
          return HttpResponse.json({ success: true });
        }),
      );

      const result = await loginWithJwt("valid-jwt");

      expect(result).toBeUndefined();
    });

    it("throws on 401 invalid JWT", async () => {
      server.use(
        http.post("/api/auth/login", () => {
          return HttpResponse.json({ error: "Invalid JWT" }, { status: 401 });
        }),
      );

      await expect(loginWithJwt("invalid-jwt")).rejects.toMatchObject({
        response: { status: 401 },
      });
    });

    it("throws on 400 bad request (malformed JWT)", async () => {
      server.use(
        http.post("/api/auth/login", () => {
          return HttpResponse.json({ error: "Malformed JWT" }, { status: 400 });
        }),
      );

      await expect(loginWithJwt("malformed")).rejects.toMatchObject({
        response: { status: 400 },
      });
    });

    it("throws on 403 forbidden (tenant disabled)", async () => {
      server.use(
        http.post("/api/auth/login", () => {
          return HttpResponse.json(
            { error: "Tenant disabled" },
            { status: 403 },
          );
        }),
      );

      await expect(
        loginWithJwt("jwt-for-disabled-tenant"),
      ).rejects.toMatchObject({
        response: { status: 403 },
      });
    });
  });
});
