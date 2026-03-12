import { ServiceUnavailableException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StripeCatalogService } from "./stripe-catalog.service.js";

function createStripeMock() {
  return {
    prices: {
      list: vi.fn(),
    },
  };
}

describe("StripeCatalogService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.NODE_ENV;
  });

  it("throws when Stripe is not configured", async () => {
    const service = new StripeCatalogService(null);
    await expect(service.resolveCheckoutPriceId("pro", "monthly")).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it("throws when the requested lookup key is missing", async () => {
    const stripe = createStripeMock();
    stripe.prices.list.mockResolvedValueOnce({ data: [] });

    const service = new StripeCatalogService(stripe as never);
    await expect(
      service.resolveCheckoutPriceId("enterprise", "annual"),
    ).rejects.toThrow("Price not configured for enterprise annual");
  });

  it("caches catalog lookups within the TTL", async () => {
    const stripe = createStripeMock();
    stripe.prices.list.mockResolvedValue({
      data: [
        { id: "price_1", lookup_key: "pro_monthly" },
        { id: "price_2", lookup_key: "pro_annual" },
      ],
    });

    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(10_000);

    const service = new StripeCatalogService(stripe as never);
    await expect(service.resolveCheckoutPriceId("pro", "monthly")).resolves.toBe(
      "price_1",
    );

    nowSpy.mockReturnValue(20_000);
    await expect(service.resolveCheckoutPriceId("pro", "annual")).resolves.toBe(
      "price_2",
    );

    expect(stripe.prices.list).toHaveBeenCalledTimes(1);
  });

  it("preloads the catalog on module init in production", async () => {
    process.env.NODE_ENV = "production";
    const stripe = createStripeMock();
    stripe.prices.list.mockResolvedValueOnce({ data: [] });

    const service = new StripeCatalogService(stripe as never);
    await service.onModuleInit();

    expect(stripe.prices.list).toHaveBeenCalledTimes(1);
  });
});

