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
import { cleanupTenant, createTenant } from "./test-data.js";

describe("Invoicing Controller (integration)", () => {
  let app: NestFastifyApplication;
  let db: PostgresJsDatabase;
  let stripe: Awaited<ReturnType<typeof createTestApp>>["stripe"];
  const adminUserId = "bo-admin-invoicing";
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    const created = await createTestApp({ userId: adminUserId, role: "admin" });
    app = created.app;
    db = created.db;
    stripe = created.stripe;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await Promise.all(createdTenantIds.map((id) => cleanupTenant(id)));
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

    it("creates an invoiced subscription, persists bindings, and writes an audit log", async () => {
      const tenant = await createTenant({ tssd: "test---bo-invoicing" });
      createdTenantIds.push(tenant.id);

      stripe.prices.list.mockResolvedValue({
        data: [
          { id: "price_pro_monthly", lookup_key: "pro_monthly" },
          { id: "price_pro_annual", lookup_key: "pro_annual" },
        ],
      });
      stripe.customers.create.mockResolvedValue({ id: "cus_test_1" });
      stripe.subscriptions.create.mockResolvedValue({
        id: "sub_test_1",
        status: "active",
        latest_invoice: {
          id: "in_test_1",
          status: "draft",
          hosted_invoice_url: "https://invoice.test/in_test_1",
          amount_due: 2500,
          due_date: null,
        },
      });
      stripe.invoices.update.mockResolvedValue({
        id: "in_test_1",
        status: "draft",
        hosted_invoice_url: "https://invoice.test/in_test_1",
        amount_due: 2500,
        due_date: null,
      });

      const response = await app.inject({
        method: "POST",
        url: "/invoicing/subscriptions",
        payload: {
          tenantEid: tenant.eid,
          tier: "pro",
          interval: "monthly",
          seatCount: 2,
          paymentTerms: "net_15",
          customerEmail: "billing@example.com",
          customerName: "Billing",
          companyName: "Example Co",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(
        expect.objectContaining({
          subscriptionId: "sub_test_1",
          stripeInvoiceId: "in_test_1",
          invoiceStatus: "draft",
          amount: 2500,
          invoiceUrl: "https://invoice.test/in_test_1",
        }),
      );

      const [binding] = await db
        .select()
        .from(stripeBillingBindings)
        .where(eq(stripeBillingBindings.tenantId, tenant.id))
        .limit(1);
      expect(binding).toEqual(
        expect.objectContaining({
          tenantId: tenant.id,
          stripeCustomerId: "cus_test_1",
          stripeSubscriptionId: "sub_test_1",
        }),
      );

      const [subscription] = await db
        .select()
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.tenantId, tenant.id))
        .limit(1);
      expect(subscription).toEqual(
        expect.objectContaining({
          tenantId: tenant.id,
          tier: "pro",
          seatLimit: 2,
          stripeCustomerId: "cus_test_1",
          stripeSubscriptionId: "sub_test_1",
        }),
      );

      const logs = await db
        .select()
        .from(backofficeAuditLogs)
        .where(
          and(
            eq(backofficeAuditLogs.backofficeUserId, adminUserId),
            eq(backofficeAuditLogs.targetTenantId, tenant.id),
            eq(
              backofficeAuditLogs.eventType,
              "backoffice.subscription_created",
            ),
          ),
        );
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe("GET /invoicing/invoices", () => {
    it("accepts request without query params", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/invoicing/invoices",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("invoices");
      expect(Array.isArray(body.invoices)).toBe(true);
      expect(body).toHaveProperty("hasMore");
      expect(body).toHaveProperty("nextCursor");
    });

    it("accepts request with explicit pagination", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/invoicing/invoices?limit=10",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("invoices");
    });

    it("rejects non-numeric limit", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/invoicing/invoices?limit=abc",
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /invoicing/tenants/:tenantId/invoices", () => {
    it("returns an empty list when tenant has no binding", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/invoicing/tenants/00000000-0000-0000-0000-000000000000/invoices",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it("lists invoices for a tenant when a Stripe binding exists", async () => {
      const tenant = await createTenant({ tssd: "test---bo-invoicing-list" });
      createdTenantIds.push(tenant.id);

      await db.insert(stripeBillingBindings).values({
        tenantId: tenant.id,
        stripeCustomerId: "cus_test_list",
        stripeSubscriptionId: "sub_test_list",
      });

      stripe.invoices.list.mockResolvedValue({
        data: [
          {
            amount_due: 1000,
            status: "open",
            created: 1700000000,
            due_date: null,
            hosted_invoice_url: "https://invoice.test/1",
          },
        ],
        has_more: false,
      });

      const response = await app.inject({
        method: "GET",
        url: `/invoicing/tenants/${tenant.id}/invoices`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        expect.objectContaining({
          amount: 1000,
          status: "open",
          hostedUrl: "https://invoice.test/1",
        }),
      ]);
    });
  });
});

describe("Invoicing Controller — role-based access (integration)", () => {
  let viewerApp: NestFastifyApplication;

  beforeAll(async () => {
    ({ app: viewerApp } = await createTestApp({
      userId: "bo-viewer-invoicing",
      role: "viewer",
    }));
  });

  afterAll(async () => {
    await viewerApp.close();
  });

  it("viewer can list invoices (viewer role sufficient)", async () => {
    const response = await viewerApp.inject({
      method: "GET",
      url: "/invoicing/invoices",
    });

    expect(response.statusCode).toBe(200);
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
