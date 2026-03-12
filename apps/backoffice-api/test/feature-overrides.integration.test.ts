import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "./setup.js";

describe("Feature Overrides Controller (integration)", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  describe("PUT /tenants/:tenantId/feature-overrides/:featureKey", () => {
    it("rejects empty body (missing enabled field)", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/tenants/some-tenant-id/feature-overrides/basicLinting",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toBe("Validation failed");
      expect(body.errors).toHaveProperty("enabled");
    });

    it("passes Zod validation for boolean enabled", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/tenants/00000000-0000-0000-0000-000000000000/feature-overrides/basicLinting",
        payload: { enabled: true },
      });

      // Validation passes; may get 500 from FK constraint if tenant doesn't exist
      expect([200, 500]).toContain(response.statusCode);
    });

    it("rejects non-boolean enabled", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/tenants/00000000-0000-0000-0000-000000000000/feature-overrides/minimap",
        payload: { enabled: "yes" },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toBe("Validation failed");
      expect(body.errors).toHaveProperty("enabled");
    });

    it("rejects invalid feature key", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/tenants/00000000-0000-0000-0000-000000000000/feature-overrides/nonExistentFeature",
        payload: { enabled: true },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toContain("Invalid feature key");
    });
  });

  describe("GET /tenants/:tenantId/feature-overrides", () => {
    it("returns list for valid tenant ID", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tenants/00000000-0000-0000-0000-000000000000/feature-overrides",
      });

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.json())).toBe(true);
    });
  });

  describe("DELETE /tenants/:tenantId/feature-overrides/:featureKey", () => {
    it("returns 200 for valid feature key", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/tenants/00000000-0000-0000-0000-000000000000/feature-overrides/basicLinting",
      });

      expect(response.statusCode).toBe(200);
    });
  });
});

describe("Feature Overrides Controller — role-based access (integration)", () => {
  let viewerApp: NestFastifyApplication;

  beforeAll(async () => {
    ({ app: viewerApp } = await createTestApp({ role: "viewer" }));
  });

  afterAll(async () => {
    await viewerApp.close();
  });

  it("viewer cannot list feature overrides (admin required)", async () => {
    const response = await viewerApp.inject({
      method: "GET",
      url: "/tenants/some-tenant-id/feature-overrides",
    });

    expect(response.statusCode).toBe(403);
  });

  it("viewer cannot set feature override (admin required)", async () => {
    const response = await viewerApp.inject({
      method: "PUT",
      url: "/tenants/some-tenant-id/feature-overrides/basicLinting",
      payload: { enabled: true },
    });

    expect(response.statusCode).toBe(403);
  });

  it("viewer cannot delete feature override (admin required)", async () => {
    const response = await viewerApp.inject({
      method: "DELETE",
      url: "/tenants/some-tenant-id/feature-overrides/basicLinting",
    });

    expect(response.statusCode).toBe(403);
  });
});
