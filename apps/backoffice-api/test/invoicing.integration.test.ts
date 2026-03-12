import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "./setup.js";

describe("Invoicing Controller (integration)", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /invoicing/subscriptions", () => {
    it("rejects empty body", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/invoicing/subscriptions",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toBe("Validation failed");
    });

    it("rejects invalid tier", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/invoicing/subscriptions",
        payload: {
          tenantEid: "test-eid",
          tier: "free",
          interval: "monthly",
          seatCount: 5,
          customerEmail: "test@example.com",
          customerName: "Test",
          companyName: "TestCo",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.errors).toHaveProperty("tier");
    });

    it("rejects invalid interval", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/invoicing/subscriptions",
        payload: {
          tenantEid: "test-eid",
          tier: "pro",
          interval: "biweekly",
          seatCount: 5,
          customerEmail: "test@example.com",
          customerName: "Test",
          companyName: "TestCo",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.errors).toHaveProperty("interval");
    });

    it("rejects seatCount less than 1", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/invoicing/subscriptions",
        payload: {
          tenantEid: "test-eid",
          tier: "pro",
          interval: "monthly",
          seatCount: 0,
          customerEmail: "test@example.com",
          customerName: "Test",
          companyName: "TestCo",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects seatCount exceeding 1000", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/invoicing/subscriptions",
        payload: {
          tenantEid: "test-eid",
          tier: "pro",
          interval: "monthly",
          seatCount: 1001,
          customerEmail: "test@example.com",
          customerName: "Test",
          companyName: "TestCo",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects invalid customerEmail", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/invoicing/subscriptions",
        payload: {
          tenantEid: "test-eid",
          tier: "pro",
          interval: "monthly",
          seatCount: 5,
          customerEmail: "not-an-email",
          customerName: "Test",
          companyName: "TestCo",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.errors).toHaveProperty("customerEmail");
    });

    it("rejects empty tenantEid", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/invoicing/subscriptions",
        payload: {
          tenantEid: "",
          tier: "pro",
          interval: "monthly",
          seatCount: 5,
          customerEmail: "test@example.com",
          customerName: "Test",
          companyName: "TestCo",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects invalid paymentTerms", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/invoicing/subscriptions",
        payload: {
          tenantEid: "test-eid",
          tier: "pro",
          interval: "monthly",
          seatCount: 5,
          paymentTerms: "net_90",
          customerEmail: "test@example.com",
          customerName: "Test",
          companyName: "TestCo",
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /invoicing/invoices", () => {
    it("accepts request without query params", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/invoicing/invoices",
      });

      // Stripe may not be configured — accept 200 or 500, not 400 or 403
      expect(response.statusCode).not.toBe(400);
      expect(response.statusCode).not.toBe(403);
    });

    it("accepts request with explicit pagination", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/invoicing/invoices?limit=10",
      });

      // Stripe may not be configured — accept 200 or 500, not 400 or 403
      expect(response.statusCode).not.toBe(400);
      expect(response.statusCode).not.toBe(403);
    });

    it("rejects non-numeric limit", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/invoicing/invoices?limit=abc",
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

describe("Invoicing Controller — role-based access (integration)", () => {
  let viewerApp: NestFastifyApplication;

  beforeAll(async () => {
    ({ app: viewerApp } = await createTestApp({ role: "viewer" }));
  });

  afterAll(async () => {
    await viewerApp.close();
  });

  it("viewer can list invoices (viewer role sufficient)", async () => {
    const response = await viewerApp.inject({
      method: "GET",
      url: "/invoicing/invoices",
    });

    expect(response.statusCode).not.toBe(403);
  });

  it("viewer cannot create subscriptions (editor required)", async () => {
    const response = await viewerApp.inject({
      method: "POST",
      url: "/invoicing/subscriptions",
      payload: {
        tenantEid: "test-eid",
        tier: "pro",
        interval: "monthly",
        seatCount: 5,
        customerEmail: "test@example.com",
        customerName: "Test",
        companyName: "TestCo",
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
