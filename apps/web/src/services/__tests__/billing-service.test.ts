import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import api from "@/services/api";
import {
  confirmCheckoutSession,
  createCheckout,
  createPortalSession,
  fetchPrices,
} from "@/services/billing";

const mockApi = vi.mocked(api);

describe("billing service", () => {
  beforeEach(() => {
    mockApi.get.mockReset();
    mockApi.post.mockReset();
  });

  it("fetches prices from the billing prices endpoint", async () => {
    mockApi.get.mockResolvedValue({
      data: { pro: { monthly: 29, annual: 24.17 } },
    });

    const result = await fetchPrices();

    expect(mockApi.get).toHaveBeenCalledWith("/billing/prices");
    expect(result).toEqual({ pro: { monthly: 29, annual: 24.17 } });
  });

  it("creates a checkout session for the requested plan", async () => {
    mockApi.post.mockResolvedValue({
      data: { url: "https://checkout.stripe.com/session-1" },
    });

    const result = await createCheckout("pro", "monthly");

    expect(mockApi.post).toHaveBeenCalledWith("/billing/checkout", {
      tier: "pro",
      interval: "monthly",
    });
    expect(result.url).toBe("https://checkout.stripe.com/session-1");
  });

  it("creates a billing portal session", async () => {
    mockApi.post.mockResolvedValue({
      data: { url: "https://billing.stripe.com/session-1" },
    });

    const result = await createPortalSession();

    expect(mockApi.post).toHaveBeenCalledWith("/billing/portal");
    expect(result.url).toBe("https://billing.stripe.com/session-1");
  });

  it("confirms a checkout session by encoded session id", async () => {
    mockApi.get.mockResolvedValue({
      data: { status: "pending" },
    });

    const result = await confirmCheckoutSession("cs_test/with spaces");

    expect(mockApi.get).toHaveBeenCalledWith(
      "/billing/checkout-session/cs_test%2Fwith%20spaces",
    );
    expect(result).toEqual({ status: "pending" });
  });
});
