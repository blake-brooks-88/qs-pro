import { NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InvoicingService } from "./invoicing.service.js";

function makeLimitSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function makeWhereSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function makeInsertChain() {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

describe("InvoicingService", () => {
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ENCRYPTION_KEY = "a".repeat(64);
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalEncryptionKey;
  });

  it("throws NotFoundException when tenant EID does not exist", async () => {
    const stripe = {
      customers: { update: vi.fn(), create: vi.fn() },
      subscriptions: { create: vi.fn() },
      invoices: { retrieve: vi.fn(), update: vi.fn(), list: vi.fn() },
    };

    const db = {
      select: vi.fn().mockReturnValueOnce(makeLimitSelectChain([])),
      insert: vi.fn(),
    };

    const auditService = { log: vi.fn() };
    const catalogService = { resolveCheckoutPriceId: vi.fn() };

    const service = new InvoicingService(
      stripe as never,
      db as never,
      auditService as never,
      catalogService as never,
    );

    await expect(
      service.createInvoicedSubscription(
        {
          tenantEid: "missing",
          tier: "pro",
          interval: "monthly",
          seatCount: 1,
          paymentTerms: "net_30",
          customerEmail: "billing@example.com",
          customerName: "Billing",
          companyName: "Example Co",
        },
        "bo-user-1",
        "127.0.0.1",
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("requires ENCRYPTION_KEY env var", async () => {
    process.env.ENCRYPTION_KEY = "";

    const stripe = {
      customers: { update: vi.fn(), create: vi.fn() },
      subscriptions: { create: vi.fn() },
      invoices: { retrieve: vi.fn(), update: vi.fn(), list: vi.fn() },
    };

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          makeLimitSelectChain([{ id: "t-1", eid: "test---eid" }]),
        ),
      insert: vi.fn(),
    };

    const auditService = { log: vi.fn() };
    const catalogService = { resolveCheckoutPriceId: vi.fn() };

    const service = new InvoicingService(
      stripe as never,
      db as never,
      auditService as never,
      catalogService as never,
    );

    await expect(
      service.createInvoicedSubscription(
        {
          tenantEid: "test---eid",
          tier: "pro",
          interval: "monthly",
          seatCount: 1,
          paymentTerms: "net_30",
          customerEmail: "billing@example.com",
          customerName: "Billing",
          companyName: "Example Co",
        },
        "bo-user-1",
        "127.0.0.1",
      ),
    ).rejects.toThrow("Missing required env var: ENCRYPTION_KEY");
  });

  it("creates an invoiced subscription for an existing customer and draft invoice", async () => {
    const stripe = {
      customers: {
        update: vi.fn().mockResolvedValue(undefined),
        create: vi.fn(),
      },
      subscriptions: {
        create: vi.fn().mockResolvedValue({
          id: "sub_1",
          status: "active",
          latest_invoice: {
            id: "in_1",
            status: "draft",
            hosted_invoice_url: null,
            amount_due: 2500,
            due_date: 1730000000,
          },
        }),
      },
      invoices: {
        retrieve: vi.fn(),
        update: vi.fn().mockResolvedValue({
          id: "in_1",
          status: "draft",
          hosted_invoice_url: null,
          amount_due: 2500,
          due_date: 1730000000,
        }),
        list: vi.fn(),
      },
    };

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          makeLimitSelectChain([{ id: "t-1", eid: "test---eid" }]),
        )
        .mockReturnValueOnce(
          makeLimitSelectChain([
            { tenantId: "t-1", stripeCustomerId: "cus_1" },
          ]),
        ),
      insert: vi.fn().mockReturnValue(makeInsertChain()),
    };

    const auditService = { log: vi.fn().mockResolvedValue(undefined) };
    const catalogService = {
      resolveCheckoutPriceId: vi.fn().mockResolvedValue("price_1"),
    };

    const service = new InvoicingService(
      stripe as never,
      db as never,
      auditService as never,
      catalogService as never,
    );

    const result = await service.createInvoicedSubscription(
      {
        tenantEid: "test---eid",
        tier: "pro",
        interval: "monthly",
        seatCount: 2,
        paymentTerms: "net_15",
        customerEmail: "billing@example.com",
        customerName: "Billing",
        companyName: "Example Co",
        couponId: "coupon_1",
      },
      "bo-user-1",
      "127.0.0.1",
    );

    expect(result).toEqual(
      expect.objectContaining({
        subscriptionId: "sub_1",
        stripeInvoiceId: "in_1",
        invoiceStatus: "draft",
        amount: 2500,
      }),
    );
    expect(stripe.customers.update).toHaveBeenCalledWith(
      "cus_1",
      expect.objectContaining({
        email: "billing@example.com",
        name: "Billing",
      }),
    );
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_1",
        days_until_due: 15,
        discounts: [{ coupon: "coupon_1" }],
      }),
    );
    expect(stripe.invoices.update).toHaveBeenCalledWith(
      "in_1",
      expect.objectContaining({ auto_advance: false }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        backofficeUserId: "bo-user-1",
        eventType: "backoffice.subscription_created",
        ipAddress: "127.0.0.1",
      }),
    );
  });

  it("creates a new Stripe customer and retrieves invoice when latest_invoice is a string", async () => {
    const stripe = {
      customers: {
        update: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: "cus_new" }),
      },
      subscriptions: {
        create: vi.fn().mockResolvedValue({
          id: "sub_2",
          status: "active",
          latest_invoice: "in_2",
        }),
      },
      invoices: {
        retrieve: vi.fn().mockResolvedValue({
          id: "in_2",
          status: "open",
          hosted_invoice_url: "https://invoice.test/in_2",
          amount_due: 5000,
          due_date: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: "in_2",
          status: "open",
          hosted_invoice_url: "https://invoice.test/in_2",
          amount_due: 5000,
          due_date: null,
        }),
        list: vi.fn(),
      },
    };

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          makeLimitSelectChain([{ id: "t-2", eid: "test---eid-2" }]),
        )
        .mockReturnValueOnce(makeLimitSelectChain([])),
      insert: vi.fn().mockReturnValue(makeInsertChain()),
    };

    const auditService = { log: vi.fn().mockResolvedValue(undefined) };
    const catalogService = {
      resolveCheckoutPriceId: vi.fn().mockResolvedValue("price_2"),
    };

    const service = new InvoicingService(
      stripe as never,
      db as never,
      auditService as never,
      catalogService as never,
    );

    const result = await service.createInvoicedSubscription(
      {
        tenantEid: "test---eid-2",
        tier: "enterprise",
        interval: "annual",
        seatCount: 5,
        paymentTerms: "net_60",
        customerEmail: "billing@example.com",
        customerName: "Billing",
        companyName: "Example Co",
      },
      "bo-user-1",
      "127.0.0.1",
    );

    expect(result).toEqual(
      expect.objectContaining({
        subscriptionId: "sub_2",
        invoiceUrl: "https://invoice.test/in_2",
        stripeInvoiceId: "in_2",
      }),
    );
    expect(stripe.customers.create).toHaveBeenCalled();
    expect(stripe.invoices.retrieve).toHaveBeenCalledWith("in_2");
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ days_until_due: 60 }),
    );
  });

  it("lists invoices for a tenant when a Stripe binding exists", async () => {
    const stripe = {
      customers: { update: vi.fn(), create: vi.fn() },
      subscriptions: { create: vi.fn() },
      invoices: {
        retrieve: vi.fn(),
        update: vi.fn(),
        list: vi.fn().mockResolvedValue({
          data: [
            {
              amount_due: 1000,
              status: "paid",
              created: 1700000000,
              due_date: null,
              hosted_invoice_url: "https://invoice.test/1",
            },
          ],
        }),
      },
    };

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          makeLimitSelectChain([{ stripeCustomerId: "cus_1" }]),
        ),
      insert: vi.fn(),
    };

    const auditService = { log: vi.fn() };
    const catalogService = { resolveCheckoutPriceId: vi.fn() };

    const service = new InvoicingService(
      stripe as never,
      db as never,
      auditService as never,
      catalogService as never,
    );

    const result = await service.listInvoicesForTenant("tenant-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        amount: 1000,
        status: "paid",
        hostedUrl: "https://invoice.test/1",
      }),
    );
  });

  it("lists all invoices and resolves tenant EIDs from customer bindings", async () => {
    const stripe = {
      customers: { update: vi.fn(), create: vi.fn() },
      subscriptions: { create: vi.fn() },
      invoices: {
        retrieve: vi.fn(),
        update: vi.fn(),
        list: vi.fn().mockResolvedValue({
          data: [
            {
              id: "in_1",
              customer: "cus_1",
              customer_name: "Acme",
              amount_due: 2500,
              status: "open",
              created: 1700000000,
              due_date: 1730000000,
              hosted_invoice_url: "https://invoice.test/1",
            },
          ],
          has_more: true,
        }),
      },
    };

    const db = {
      select: vi.fn().mockReturnValueOnce(
        makeWhereSelectChain([{ stripeCustomerId: "cus_1", eid: "eid-1" }]),
      ),
      insert: vi.fn(),
    };

    const auditService = { log: vi.fn() };
    const catalogService = { resolveCheckoutPriceId: vi.fn() };

    const service = new InvoicingService(
      stripe as never,
      db as never,
      auditService as never,
      catalogService as never,
    );

    const result = await service.listAllInvoices({
      limit: 500,
      startingAfter: "in_prev",
    });

    expect(stripe.invoices.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100, starting_after: "in_prev" }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        invoices: [
          expect.objectContaining({
            tenantEid: "eid-1",
            tenantName: "Acme",
            hostedUrl: "https://invoice.test/1",
          }),
        ],
        hasMore: true,
        nextCursor: "in_1",
      }),
    );
  });
});
