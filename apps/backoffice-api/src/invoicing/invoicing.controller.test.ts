import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { InvoicingController } from "./invoicing.controller.js";

describe("InvoicingController", () => {
  it("passes through create subscription calls with user and ip", async () => {
    const invoicingService = {
      createInvoicedSubscription: vi.fn().mockResolvedValue({ ok: true }),
      listInvoicesForTenant: vi.fn(),
      listAllInvoices: vi.fn(),
    };

    const controller = new InvoicingController(invoicingService as never);
    const req = { ip: "127.0.0.1" } as unknown as FastifyRequest;

    const result = await controller.createSubscription(
      {
        tenantEid: "test---tenant",
        tier: "enterprise",
        interval: "monthly",
        seatCount: 10,
        paymentTerms: "net_30",
        customerEmail: "billing@example.com",
        customerName: "Billing",
        companyName: "Example Co",
      },
      { id: "bo-user-1" },
      req,
    );

    expect(result).toEqual({ ok: true });
    expect(invoicingService.createInvoicedSubscription).toHaveBeenCalledWith(
      expect.any(Object),
      "bo-user-1",
      "127.0.0.1",
    );
  });

  it("lists tenant invoices via service", async () => {
    const invoicingService = {
      createInvoicedSubscription: vi.fn(),
      listInvoicesForTenant: vi.fn().mockResolvedValue([{ hostedUrl: "x" }]),
      listAllInvoices: vi.fn(),
    };

    const controller = new InvoicingController(invoicingService as never);
    const result = await controller.listTenantInvoices("tenant-1");

    expect(result).toEqual([{ hostedUrl: "x" }]);
    expect(invoicingService.listInvoicesForTenant).toHaveBeenCalledWith(
      "tenant-1",
    );
  });

  it("lists all invoices with query pass-through", async () => {
    const invoicingService = {
      createInvoicedSubscription: vi.fn(),
      listInvoicesForTenant: vi.fn(),
      listAllInvoices: vi
        .fn()
        .mockResolvedValue({ invoices: [], hasMore: false, nextCursor: null }),
    };

    const controller = new InvoicingController(invoicingService as never);
    const result = await controller.listAllInvoices({
      limit: 10,
      startingAfter: "in_1",
    });

    expect(result).toEqual({ invoices: [], hasMore: false, nextCursor: null });
    expect(invoicingService.listAllInvoices).toHaveBeenCalledWith({
      limit: 10,
      startingAfter: "in_1",
    });
  });
});
