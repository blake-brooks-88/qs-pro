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

const mockGet = vi.mocked(api.get as ReturnType<typeof vi.fn>);
const mockPost = vi.mocked(api.post as ReturnType<typeof vi.fn>);

describe("billing service", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("fetches prices from the billing prices endpoint", async () => {
    mockGet.mockResolvedValue({
      data: { pro: { monthly: 29, annual: 24.17 } },
    });

    const result = await fetchPrices();

    expect(mockGet).toHaveBeenCalledWith("/billing/prices");
    expect(result).toEqual({ pro: { monthly: 29, annual: 24.17 } });
  });

  it("creates a checkout session for the requested plan", async () => {
    mockPost.mockResolvedValue({
      data: { url: "https://checkout.stripe.com/session-1" },
    });

    const result = await createCheckout("pro", "monthly");

    expect(mockPost).toHaveBeenCalledWith("/billing/checkout", {
      tier: "pro",
      interval: "monthly",
    });
    expect(result.url).toBe("https://checkout.stripe.com/session-1");
  });

  it("creates a billing portal session", async () => {
    mockPost.mockResolvedValue({
      data: { url: "https://billing.stripe.com/session-1" },
    });

    const result = await createPortalSession();

    expect(mockPost).toHaveBeenCalledWith("/billing/portal");
    expect(result.url).toBe("https://billing.stripe.com/session-1");
  });

  it("confirms a checkout session by encoded session id", async () => {
    mockGet.mockResolvedValue({
      data: { status: "pending" },
    });

    const result = await confirmCheckoutSession("cs_test/with spaces");

    expect(mockGet).toHaveBeenCalledWith(
      "/billing/checkout-session/cs_test%2Fwith%20spaces",
    );
    expect(result).toEqual({ status: "pending" });
  });
});
