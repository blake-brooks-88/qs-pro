import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "./setup.js";

describe("Tenants Controller (integration)", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /tenants", () => {
    it("returns paginated tenant list", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tenants",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("data");
      expect(Array.isArray(body.data)).toBe(true);
      expect(body).toHaveProperty("page");
      expect(body).toHaveProperty("limit");
      expect(body).toHaveProperty("total");
      expect(typeof body.total).toBe("number");
    });

    it("applies default pagination values", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tenants",
      });

      const body = response.json();
      expect(body.page).toBe(1);
      expect(body.limit).toBe(25);
    });

    it("rejects non-numeric page param", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tenants?page=abc",
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toBe("Validation failed");
    });

    it("rejects page less than 1", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tenants?page=0",
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects limit exceeding 100", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tenants?limit=999",
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects invalid tier filter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tenants?tier=diamond",
      });

      expect(response.statusCode).toBe(400);
    });

    it("accepts valid tier filter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tenants?tier=pro",
      });

      expect(response.statusCode).toBe(200);
    });

    it("rejects invalid sortBy field", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tenants?sortBy=nonExistentField",
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects invalid sortOrder", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tenants?sortOrder=sideways",
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /tenants/:id", () => {
    it("returns 404 for non-existent tenant", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tenants/00000000-0000-0000-0000-000000000000",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /tenants/lookup/:eid", () => {
    it("returns 404 for non-existent EID", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tenants/lookup/nonexistent-eid-999999",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PATCH /tenants/:id/tier", () => {
    it("rejects tier=free with descriptive message", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/tenants/00000000-0000-0000-0000-000000000000/tier",
        payload: { tier: "free", interval: "month" },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toContain("Cannot change tier to free");
    });

    it("rejects invalid tier value", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/tenants/00000000-0000-0000-0000-000000000000/tier",
        payload: { tier: "platinum" },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toBe("Validation failed");
    });

    it("rejects invalid interval", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/tenants/00000000-0000-0000-0000-000000000000/tier",
        payload: { tier: "pro", interval: "biweekly" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects empty body", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/tenants/00000000-0000-0000-0000-000000000000/tier",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

describe("Tenants Controller — role-based access (integration)", () => {
  let viewerApp: NestFastifyApplication;

  beforeAll(async () => {
    ({ app: viewerApp } = await createTestApp({ role: "viewer" }));
  });

  afterAll(async () => {
    await viewerApp.close();
  });

  it("viewer can list tenants", async () => {
    const response = await viewerApp.inject({
      method: "GET",
      url: "/tenants",
    });

    expect(response.statusCode).toBe(200);
  });

  it("viewer cannot change tier (admin required)", async () => {
    const response = await viewerApp.inject({
      method: "PATCH",
      url: "/tenants/00000000-0000-0000-0000-000000000000/tier",
      payload: { tier: "pro", interval: "month" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("viewer cannot cancel subscription (admin required)", async () => {
    const response = await viewerApp.inject({
      method: "POST",
      url: "/tenants/00000000-0000-0000-0000-000000000000/cancel",
    });

    expect(response.statusCode).toBe(403);
  });
});
