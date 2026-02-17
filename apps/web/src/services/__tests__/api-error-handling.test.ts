import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/store/auth-store";
import { server } from "@/test/mocks/server";

import api from "../api";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mockToastError = vi.mocked(toast.error);

describe("API client error handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({
      user: null,
      tenant: null,
      csrfToken: null,
      isAuthenticated: false,
    });
  });

  describe("401 Unauthorized - refresh flow", () => {
    let retryMarkerInterceptorId: number | null = null;

    afterEach(() => {
      if (retryMarkerInterceptorId !== null) {
        api.interceptors.request.eject(retryMarkerInterceptorId);
        retryMarkerInterceptorId = null;
      }
    });

    it("attempts token refresh on 401 when user is authenticated", async () => {
      let refreshCalled = false;
      let retryCalled = false;

      server.use(
        http.get("/api/test-protected", ({ request }) => {
          const isRetry = request.headers.get("x-retry-marker") === "true";
          if (isRetry) {
            retryCalled = true;
            return HttpResponse.json({ data: "success" });
          }
          return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
        }),
        http.get("/api/auth/refresh", () => {
          refreshCalled = true;
          return HttpResponse.json({ success: true });
        }),
      );

      useAuthStore.setState({
        user: {
          id: "u1",
          sfUserId: "sf1",
          email: "test@test.com",
          name: "Test",
        },
        tenant: { id: "t1", eid: "e1", tssd: "tssd1" },
        isAuthenticated: true,
      });

      // Add retry marker to track the retried request (cleaned up in afterEach)
      retryMarkerInterceptorId = api.interceptors.request.use((config) => {
        if ((config as { _retry?: boolean })._retry) {
          config.headers.set("x-retry-marker", "true");
        }
        return config;
      });

      const response = await api.get("/test-protected");

      expect(refreshCalled).toBe(true);
      expect(retryCalled).toBe(true);
      expect(response.data).toEqual({ data: "success" });
    });

    it("calls logout and shows toast when refresh fails", async () => {
      server.use(
        http.get("/api/test-protected", () => {
          return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
        }),
        http.get("/api/auth/refresh", () => {
          return HttpResponse.json(
            { error: "Refresh failed" },
            { status: 401 },
          );
        }),
      );

      useAuthStore.setState({
        user: {
          id: "u1",
          sfUserId: "sf1",
          email: "test@test.com",
          name: "Test",
        },
        tenant: { id: "t1", eid: "e1", tssd: "tssd1" },
        isAuthenticated: true,
      });

      await expect(api.get("/test-protected")).rejects.toThrow();

      expect(mockToastError).toHaveBeenCalledWith(
        "Session expired. Please log in again.",
      );

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it("does not attempt refresh when user is not authenticated", async () => {
      let refreshCalled = false;

      server.use(
        http.get("/api/test-unauth", () => {
          return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
        }),
        http.get("/api/auth/refresh", () => {
          refreshCalled = true;
          return HttpResponse.json({ success: true });
        }),
      );

      await expect(api.get("/test-unauth")).rejects.toThrow();

      expect(refreshCalled).toBe(false);
    });

    it("does not retry more than once (prevents infinite loop)", async () => {
      let requestCount = 0;

      server.use(
        http.get("/api/test-always-401", () => {
          requestCount++;
          return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
        }),
        http.get("/api/auth/refresh", () => {
          return HttpResponse.json({ success: true });
        }),
      );

      useAuthStore.setState({
        user: {
          id: "u1",
          sfUserId: "sf1",
          email: "test@test.com",
          name: "Test",
        },
        tenant: { id: "t1", eid: "e1", tssd: "tssd1" },
        isAuthenticated: true,
      });

      await expect(api.get("/test-always-401")).rejects.toThrow();

      // Original request + one retry = 2 requests max
      expect(requestCount).toBe(2);
    });
  });

  describe("403 Forbidden", () => {
    it("rejects with 403 error without special handling", async () => {
      server.use(
        http.get("/api/test-forbidden", () => {
          return HttpResponse.json({ error: "Forbidden" }, { status: 403 });
        }),
      );

      await expect(api.get("/test-forbidden")).rejects.toMatchObject({
        response: { status: 403 },
      });
    });
  });

  describe("404 Not Found", () => {
    it("rejects with 404 error without special handling", async () => {
      server.use(
        http.get("/api/test-notfound", () => {
          return HttpResponse.json({ error: "Not found" }, { status: 404 });
        }),
      );

      await expect(api.get("/test-notfound")).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });

  describe("500 Internal Server Error", () => {
    it("rejects with 500 error without special handling", async () => {
      server.use(
        http.get("/api/test-server-error", () => {
          return HttpResponse.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }),
      );

      await expect(api.get("/test-server-error")).rejects.toMatchObject({
        response: { status: 500 },
      });
    });
  });

  describe("SEAT_LIMIT_EXCEEDED handling", () => {
    it("shows toast when error code is SEAT_LIMIT_EXCEEDED", async () => {
      server.use(
        http.post("/api/test-seat-limit", () => {
          return HttpResponse.json(
            { code: "SEAT_LIMIT_EXCEEDED" },
            { status: 403 },
          );
        }),
      );

      useAuthStore.setState({ csrfToken: "csrf-token" });

      await expect(api.post("/test-seat-limit")).rejects.toThrow();

      expect(mockToastError).toHaveBeenCalledWith(
        "Your organization has reached its seat limit",
      );
    });

    it("shows toast when error field is SEAT_LIMIT_EXCEEDED", async () => {
      server.use(
        http.post("/api/test-seat-limit-alt", () => {
          return HttpResponse.json(
            { error: "SEAT_LIMIT_EXCEEDED" },
            { status: 403 },
          );
        }),
      );

      useAuthStore.setState({ csrfToken: "csrf-token" });

      await expect(api.post("/test-seat-limit-alt")).rejects.toThrow();

      expect(mockToastError).toHaveBeenCalledWith(
        "Your organization has reached its seat limit",
      );
    });
  });

  describe("CSRF token attachment", () => {
    it("attaches CSRF token to POST requests", async () => {
      let capturedHeaders: Record<string, string> = {};

      server.use(
        http.post("/api/test-csrf-post", ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json({ success: true });
        }),
      );

      useAuthStore.setState({ csrfToken: "my-csrf-token-123" });

      await api.post("/test-csrf-post", { data: "test" });

      expect(capturedHeaders["x-csrf-token"]).toBe("my-csrf-token-123");
    });

    it("attaches CSRF token to PUT requests", async () => {
      let capturedHeaders: Record<string, string> = {};

      server.use(
        http.put("/api/test-csrf-put", ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json({ success: true });
        }),
      );

      useAuthStore.setState({ csrfToken: "csrf-put-token" });

      await api.put("/test-csrf-put", { data: "test" });

      expect(capturedHeaders["x-csrf-token"]).toBe("csrf-put-token");
    });

    it("attaches CSRF token to PATCH requests", async () => {
      let capturedHeaders: Record<string, string> = {};

      server.use(
        http.patch("/api/test-csrf-patch", ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json({ success: true });
        }),
      );

      useAuthStore.setState({ csrfToken: "csrf-patch-token" });

      await api.patch("/test-csrf-patch", { data: "test" });

      expect(capturedHeaders["x-csrf-token"]).toBe("csrf-patch-token");
    });

    it("attaches CSRF token to DELETE requests", async () => {
      let capturedHeaders: Record<string, string> = {};

      server.use(
        http.delete("/api/test-csrf-delete", ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json({ success: true });
        }),
      );

      useAuthStore.setState({ csrfToken: "csrf-delete-token" });

      await api.delete("/test-csrf-delete");

      expect(capturedHeaders["x-csrf-token"]).toBe("csrf-delete-token");
    });

    it("does not attach CSRF token to GET requests", async () => {
      let capturedHeaders: Record<string, string> = {};

      server.use(
        http.get("/api/test-csrf-get", ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json({ success: true });
        }),
      );

      useAuthStore.setState({ csrfToken: "csrf-get-token" });

      await api.get("/test-csrf-get");

      expect(capturedHeaders["x-csrf-token"]).toBeUndefined();
    });

    it("handles missing CSRF token gracefully", async () => {
      let capturedHeaders: Record<string, string> = {};

      server.use(
        http.post("/api/test-no-csrf", ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json({ success: true });
        }),
      );

      useAuthStore.setState({ csrfToken: null });

      const response = await api.post("/test-no-csrf", { data: "test" });

      expect(response.status).toBe(200);
      expect(capturedHeaders["x-csrf-token"]).toBeUndefined();
    });
  });

  describe("axios configuration", () => {
    it("uses /api as baseURL", async () => {
      let capturedUrl = "";

      server.use(
        http.get("/api/my-endpoint", ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ success: true });
        }),
      );

      await api.get("/my-endpoint");

      expect(capturedUrl).toContain("/api/my-endpoint");
    });

    it("sends credentials with requests (withCredentials: true)", async () => {
      // MSW doesn't directly expose withCredentials, but we can verify
      // the axios instance is configured correctly
      expect(api.defaults.withCredentials).toBe(true);
    });
  });
});
