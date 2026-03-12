import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PostgresJsDatabase } from "@qpp/database";
import {
  and,
  backofficeAuditLogs,
  eq,
  orgSubscriptions,
  stripeBillingBindings,
} from "@qpp/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestApp } from "./setup.js";
import { cleanupTenant, createTenant, createUsersForTenant } from "./test-data.js";

describe("Tenants Controller (integration)", () => {
  let app: NestFastifyApplication;
  let db: PostgresJsDatabase;
  let stripe: Awaited<ReturnType<typeof createTestApp>>["stripe"];
  const adminUserId = "bo-admin-tenants";

  let tenantId: string;
  let tenantEid: string;

  beforeAll(async () => {
    const created = await createTestApp({
      userId: adminUserId,
      role: "admin",
    });
    app = created.app;
    db = created.db;
    stripe = created.stripe;

    const tenant = await createTenant({ tssd: "test---bo-tenants" });
    tenantId = tenant.id;
    tenantEid = tenant.eid;

    await db.insert(orgSubscriptions).values({
      tenantId,
      tier: "pro",
      stripeSubscriptionStatus: "active",
      stripeCustomerId: "cus_test_bo",
      stripeSubscriptionId: "sub_test_bo",
      seatLimit: 2,
    });

    await db.insert(stripeBillingBindings).values({
      tenantId,
      stripeCustomerId: "cus_test_bo",
      stripeSubscriptionId: "sub_test_bo",
    });

    await createUsersForTenant(tenantId, [
      {
        sfUserId: `sf-user-${Date.now()}-1`,
        email: "u1@test.com",
        name: "User One",
      },
      {
        sfUserId: `sf-user-${Date.now()}-2`,
        email: "u2@test.com",
        name: "User Two",
      },
    ]);

    stripe.prices.list.mockResolvedValue({
      data: [
        {
          id: "price_enterprise_monthly",
          lookup_key: "enterprise_monthly",
        },
        { id: "price_pro_monthly", lookup_key: "pro_monthly" },
      ],
    });
    stripe.subscriptions.retrieve.mockResolvedValue({
      id: "sub_test_bo",
      items: { data: [{ id: "si_1" }] },
    });
    stripe.subscriptions.update.mockResolvedValue({});
    stripe.subscriptions.cancel.mockResolvedValue({});
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await cleanupTenant(tenantId);
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

    it("includes seeded tenant with tier and userCount", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tenants?limit=50",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { data: unknown[] };
      const row = body.data.find((r) => (r as { tenantId?: string }).tenantId === tenantId) as
        | {
            tenantId: string;
            eid: string;
            tier: string;
            userCount: number;
          }
        | undefined;

      expect(row).toEqual(
        expect.objectContaining({
          tenantId,
          eid: tenantEid,
          tier: "pro",
          userCount: 2,
        }),
      );
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

    it("returns tenant detail for seeded tenant", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/tenants/${tenantId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { tenantId: string; eid: string; users: unknown[] };
      expect(body.tenantId).toBe(tenantId);
      expect(body.eid).toBe(tenantEid);
      expect(Array.isArray(body.users)).toBe(true);
      expect(body.users).toHaveLength(2);
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

    it("returns lookup result for seeded tenant", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/tenants/lookup/${tenantEid}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          eid: tenantEid,
          tier: "pro",
          userCount: 2,
        }),
      );
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

    it("updates tier for seeded tenant and writes an audit log", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: `/tenants/${tenantId}/tier`,
        payload: { tier: "enterprise", interval: "monthly" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      const [row] = await db
        .select({ tier: orgSubscriptions.tier })
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.tenantId, tenantId))
        .limit(1);
      expect(row?.tier).toBe("enterprise");

      await expect.poll(
        async () => {
          const rows = await db
            .select({ id: backofficeAuditLogs.id })
            .from(backofficeAuditLogs)
            .where(
              and(
                eq(backofficeAuditLogs.backofficeUserId, adminUserId),
                eq(backofficeAuditLogs.targetTenantId, tenantId),
                eq(backofficeAuditLogs.eventType, "backoffice.tier_changed"),
              ),
            );
          return rows.length;
        },
        { timeout: 2_000, interval: 50 },
      ).toBeGreaterThan(0);
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

  describe("POST /tenants/:id/cancel", () => {
    it("cancels subscription and writes an audit log", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/tenants/${tenantId}/cancel`,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ success: true });

      const [row] = await db
        .select({ status: orgSubscriptions.stripeSubscriptionStatus })
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.tenantId, tenantId))
        .limit(1);
      expect(row?.status).toBe("canceled");

      await expect.poll(
        async () => {
          const rows = await db
            .select({ id: backofficeAuditLogs.id })
            .from(backofficeAuditLogs)
            .where(
              and(
                eq(backofficeAuditLogs.backofficeUserId, adminUserId),
                eq(backofficeAuditLogs.targetTenantId, tenantId),
                eq(
                  backofficeAuditLogs.eventType,
                  "backoffice.subscription_canceled",
                ),
              ),
            );
          return rows.length;
        },
        { timeout: 2_000, interval: 50 },
      ).toBeGreaterThan(0);
    });
  });
});

describe("Tenants Controller — role-based access (integration)", () => {
  let viewerApp: NestFastifyApplication;

  beforeAll(async () => {
    ({ app: viewerApp } = await createTestApp({
      userId: "bo-viewer-tenants",
      role: "viewer",
    }));
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
