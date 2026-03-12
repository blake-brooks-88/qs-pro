import { NotFoundException } from "@nestjs/common";
import type { PostgresJsDatabase } from "@qpp/database";
import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InvoicingService } from "./invoicing.service.js";

function createInsertMock() {
  return {
    values: vi.fn(() => ({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    })),
  };
}

function createSelectChain<T>(result: T) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

describe("InvoicingService", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      // eslint-disable-next-line security/detect-object-injection -- controlled env keys
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("throws NotFoundException when tenant does not exist", async () => {
    process.env.ENCRYPTION_KEY =
      "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

    const stripe = {} as unknown as Stripe;
    const db = {
      select: vi.fn(() => createSelectChain([])),
    } as unknown as PostgresJsDatabase;

    const service = new InvoicingService(
      stripe as never,
      db as never,
      { log: vi.fn() } as never,
      { resolveCheckoutPriceId: vi.fn() } as never,
    );

    await expect(
      service.createInvoicedSubscription(
        {
          tenantEid: "missing",
          customerEmail: "test@example.com",
          customerName: "Test",
          companyName: "Co",
          tier: "enterprise",
          interval: "monthly",
          seatCount: 1,
          paymentTerms: "net_30",
          couponId: undefined,
        },
        "bo-1",
        "127.0.0.1",
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("updates an existing Stripe customer when a binding exists", async () => {
    process.env.ENCRYPTION_KEY =
      "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

    const stripe = {
      customers: {
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn(),
      },
      subscriptions: {
        create: vi.fn().mockResolvedValue({
          id: "sub_1",
          status: "active",
          latest_invoice: {
            id: "in_1",
            status: "draft",
            amount_due: 123,
            hosted_invoice_url: "https://stripe/in_1",
            due_date: null,
          },
        }),
      },
      invoices: {
        retrieve: vi.fn(),
        update: vi.fn().mockResolvedValue({
          id: "in_1",
          status: "draft",
          amount_due: 123,
          hosted_invoice_url: "https://stripe/in_1",
          due_date: null,
        }),
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    } as unknown as Stripe;

    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() =>
          createSelectChain([{ id: "tenant-1", eid: "EID-123" }]),
        )
        .mockImplementationOnce(() =>
          createSelectChain([{ stripeCustomerId: "cus_1" }]),
        ),
      insert: vi.fn(() => createInsertMock()),
    } as unknown as PostgresJsDatabase;

    const auditLog = vi.fn().mockResolvedValue(undefined);
    const resolveCheckoutPriceId = vi
      .fn()
      .mockResolvedValue("price_enterprise_monthly");

    const service = new InvoicingService(
      stripe as never,
      db as never,
      { log: auditLog } as never,
      { resolveCheckoutPriceId } as never,
    );

    const result = await service.createInvoicedSubscription(
      {
        tenantEid: "EID-123",
        customerEmail: "test@example.com",
        customerName: "Test User",
        companyName: "Co",
        tier: "enterprise",
        interval: "monthly",
        seatCount: 2,
        paymentTerms: "net_30",
        couponId: undefined,
      },
      "bo-1",
      "127.0.0.1",
    );

    expect(stripe.customers.update).toHaveBeenCalledTimes(1);
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.create).toHaveBeenCalledTimes(1);
    expect(result.subscriptionId).toBe("sub_1");
    expect(result.invoiceUrl).toBe("https://stripe/in_1");
  });

  it("creates a Stripe customer when no binding exists and retrieves latest_invoice when it is a string", async () => {
    process.env.ENCRYPTION_KEY =
      "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

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
          amount_due: 456,
          hosted_invoice_url: null,
          due_date: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: "in_2",
          status: "open",
          amount_due: 456,
          hosted_invoice_url: null,
          due_date: null,
        }),
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    } as unknown as Stripe;

    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() =>
          createSelectChain([{ id: "tenant-2", eid: "EID-456" }]),
        )
        .mockImplementationOnce(() => createSelectChain([])),
      insert: vi.fn(() => createInsertMock()),
    } as unknown as PostgresJsDatabase;

    const service = new InvoicingService(
      stripe as never,
      db as never,
      { log: vi.fn().mockResolvedValue(undefined) } as never,
      { resolveCheckoutPriceId: vi.fn().mockResolvedValue("price_1") } as never,
    );

    const result = await service.createInvoicedSubscription(
      {
        tenantEid: "EID-456",
        customerEmail: "test@example.com",
        customerName: "Test User",
        companyName: "Co",
        tier: "enterprise",
        interval: "monthly",
        seatCount: 1,
        paymentTerms: "net_30",
        couponId: undefined,
      },
      "bo-1",
      "127.0.0.1",
    );

    expect(stripe.customers.create).toHaveBeenCalledTimes(1);
    expect(stripe.invoices.retrieve).toHaveBeenCalledWith("in_2");
    expect(result.subscriptionId).toBe("sub_2");
    expect(result.amount).toBe(456);
  });

  it("listInvoicesForTenant() returns [] when the tenant has no Stripe binding", async () => {
    const stripe = {
      invoices: { list: vi.fn() },
    } as unknown as Stripe;

    const db = {
      select: vi.fn(() => createSelectChain([])),
    } as unknown as PostgresJsDatabase;

    const service = new InvoicingService(
      stripe as never,
      db as never,
      { log: vi.fn() } as never,
      { resolveCheckoutPriceId: vi.fn() } as never,
    );

    const result = await service.listInvoicesForTenant("tenant-1");

    expect(result).toEqual([]);
    expect(stripe.invoices.list).not.toHaveBeenCalled();
  });
});
