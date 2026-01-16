import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/store/auth-store";
import { server } from "@/test/mocks/server";

import api from "./api";

describe("API client CSRF token handling", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      tenant: null,
      csrfToken: null,
      isAuthenticated: false,
    });
  });

  it("attaches x-csrf-token header on POST requests", async () => {
    let capturedHeaders: Record<string, string> = {};

    server.use(
      http.post("/api/test-post", ({ request }) => {
        capturedHeaders = Object.fromEntries(request.headers.entries());
        return HttpResponse.json({ success: true });
      }),
    );

    useAuthStore.setState({ csrfToken: "test-csrf-token-123" });

    await api.post("/test-post", { data: "test" });

    expect(capturedHeaders["x-csrf-token"]).toBe("test-csrf-token-123");
  });

  it("attaches x-csrf-token header on PUT/PATCH/DELETE requests", async () => {
    let putHeaders: Record<string, string> = {};
    let patchHeaders: Record<string, string> = {};
    let deleteHeaders: Record<string, string> = {};

    server.use(
      http.put("/api/test-put", ({ request }) => {
        putHeaders = Object.fromEntries(request.headers.entries());
        return HttpResponse.json({ success: true });
      }),
      http.patch("/api/test-patch", ({ request }) => {
        patchHeaders = Object.fromEntries(request.headers.entries());
        return HttpResponse.json({ success: true });
      }),
      http.delete("/api/test-delete", ({ request }) => {
        deleteHeaders = Object.fromEntries(request.headers.entries());
        return HttpResponse.json({ success: true });
      }),
    );

    useAuthStore.setState({ csrfToken: "csrf-token-456" });

    await api.put("/test-put", { data: "test" });
    await api.patch("/test-patch", { data: "test" });
    await api.delete("/test-delete");

    expect(putHeaders["x-csrf-token"]).toBe("csrf-token-456");
    expect(patchHeaders["x-csrf-token"]).toBe("csrf-token-456");
    expect(deleteHeaders["x-csrf-token"]).toBe("csrf-token-456");
  });

  it("omits x-csrf-token header on GET requests", async () => {
    let capturedHeaders: Record<string, string> = {};

    server.use(
      http.get("/api/test-get", ({ request }) => {
        capturedHeaders = Object.fromEntries(request.headers.entries());
        return HttpResponse.json({ success: true });
      }),
    );

    useAuthStore.setState({ csrfToken: "csrf-token-789" });

    await api.get("/test-get");

    expect(capturedHeaders["x-csrf-token"]).toBeUndefined();
  });

  it("does not crash when CSRF token is missing (graceful fallback)", async () => {
    let capturedHeaders: Record<string, string> = {};

    server.use(
      http.post("/api/test-no-token", ({ request }) => {
        capturedHeaders = Object.fromEntries(request.headers.entries());
        return HttpResponse.json({ success: true });
      }),
    );

    useAuthStore.setState({ csrfToken: null });

    const response = await api.post("/test-no-token", { data: "test" });

    expect(response.status).toBe(200);
    expect(capturedHeaders["x-csrf-token"]).toBeUndefined();
  });
});
