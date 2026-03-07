import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPendingCheckout,
  hasPendingCheckout,
  markPendingCheckout,
  PENDING_CHECKOUT_CHANGED_EVENT,
} from "@/lib/pending-checkout";

describe("pending checkout storage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("marks checkout as pending until the TTL expires", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);

    markPendingCheckout(5_000);

    expect(hasPendingCheckout(5_999)).toBe(true);
    expect(hasPendingCheckout(6_001)).toBe(false);
  });

  it("clears pending checkout and removes the session storage entry", () => {
    markPendingCheckout();

    clearPendingCheckout();

    expect(hasPendingCheckout()).toBe(false);
    expect(
      window.sessionStorage.getItem("pendingCheckoutPollUntil"),
    ).toBeNull();
  });

  it("removes malformed storage values when checking pending state", () => {
    window.sessionStorage.setItem("pendingCheckoutPollUntil", "not-a-number");

    expect(hasPendingCheckout()).toBe(false);
    expect(
      window.sessionStorage.getItem("pendingCheckoutPollUntil"),
    ).toBeNull();
  });

  it("dispatches a change event when marking and clearing pending checkout", () => {
    const listener = vi.fn();
    window.addEventListener(PENDING_CHECKOUT_CHANGED_EVENT, listener);

    markPendingCheckout();
    clearPendingCheckout();

    expect(listener).toHaveBeenCalledTimes(2);

    window.removeEventListener(PENDING_CHECKOUT_CHANGED_EVENT, listener);
  });
});
