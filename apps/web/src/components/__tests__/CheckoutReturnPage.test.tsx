import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CheckoutReturnPage } from "@/components/CheckoutReturnPage";

vi.mock("@/lib/checkout-return-signal", () => ({
  broadcastCheckoutReturnSignal: vi.fn(),
}));

vi.mock("@/services/billing", () => ({
  confirmCheckoutSession: vi.fn(),
}));

import { broadcastCheckoutReturnSignal } from "@/lib/checkout-return-signal";
import { confirmCheckoutSession } from "@/services/billing";

const mockBroadcastCheckoutReturnSignal = vi.mocked(
  broadcastCheckoutReturnSignal,
);
const mockConfirmCheckoutSession = vi.mocked(confirmCheckoutSession);

describe("CheckoutReturnPage", () => {
  const originalLocation = window.location;
  const originalSetTimeout = window.setTimeout;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    mockConfirmCheckoutSession.mockReset();
    mockBroadcastCheckoutReturnSignal.mockReset();
    vi.spyOn(window, "close").mockImplementation(() => undefined);
  });

  function setSearch(search: string) {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        search,
      },
    });
  }

  it("shows success and schedules auto-close only after checkout is fulfilled", async () => {
    setSearch("?checkout=success&session_id=cs_success");
    mockConfirmCheckoutSession.mockResolvedValue({ status: "fulfilled" });
    vi.spyOn(window, "setTimeout").mockImplementation(((
      callback: TimerHandler,
      delay?: number,
    ) => {
      return originalSetTimeout(callback, delay === 4000 ? 0 : delay);
    }) as typeof window.setTimeout);

    render(<CheckoutReturnPage />);

    await waitFor(() => {
      expect(screen.getByText(/you're on pro!/i)).toBeInTheDocument();
    });

    expect(mockConfirmCheckoutSession).toHaveBeenCalledWith("cs_success");
    await waitFor(() => {
      expect(mockBroadcastCheckoutReturnSignal).toHaveBeenCalledWith("success");
    });
    await waitFor(() => {
      expect(window.close).toHaveBeenCalledTimes(1);
    });
  });

  it("shows an expired message when the checkout session expired", async () => {
    setSearch("?checkout=success&session_id=cs_expired");
    mockConfirmCheckoutSession.mockResolvedValue({
      status: "failed",
      reason: "expired",
    });

    render(<CheckoutReturnPage />);

    await waitFor(() => {
      expect(screen.getByText("Checkout session expired")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/expired before payment completed/i),
    ).toBeInTheDocument();
    expect(mockBroadcastCheckoutReturnSignal).toHaveBeenCalledWith("expired");
    expect(window.close).not.toHaveBeenCalled();
  });

  it("shows an unpaid message when Stripe did not confirm payment", async () => {
    setSearch("?checkout=success&session_id=cs_unpaid");
    mockConfirmCheckoutSession.mockResolvedValue({
      status: "failed",
      reason: "unpaid",
    });

    render(<CheckoutReturnPage />);

    await waitFor(() => {
      expect(screen.getByText("Payment not confirmed")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Stripe did not confirm payment/i),
    ).toBeInTheDocument();
    expect(mockBroadcastCheckoutReturnSignal).toHaveBeenCalledWith("unpaid");
  });

  it("shows a timeout message when confirmation never resolves successfully", async () => {
    setSearch("?checkout=success&session_id=cs_pending");
    mockConfirmCheckoutSession.mockResolvedValue({ status: "pending" });
    vi.spyOn(window, "setTimeout").mockImplementation(((
      callback: TimerHandler,
      delay?: number,
    ) => {
      return originalSetTimeout(callback, delay === 2000 ? 0 : delay);
    }) as typeof window.setTimeout);

    render(<CheckoutReturnPage />);

    await waitFor(() => {
      expect(
        screen.getByText("We could not confirm your plan yet"),
      ).toBeInTheDocument();
    });

    expect(mockConfirmCheckoutSession).toHaveBeenCalledTimes(12);
    expect(mockBroadcastCheckoutReturnSignal).toHaveBeenCalledWith("timeout");
    expect(window.close).not.toHaveBeenCalled();
  });

  it("lets the user close the tab from the timeout state", async () => {
    setSearch("?checkout=success&session_id=cs_retry");
    mockConfirmCheckoutSession.mockResolvedValue({
      status: "failed",
      reason: "expired",
    });

    render(<CheckoutReturnPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Close this tab" }),
      ).toBeInTheDocument();
    });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Close this tab" }));

    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it("shows canceled when Stripe returns without a session id", () => {
    setSearch("?checkout=cancel");

    render(<CheckoutReturnPage />);

    expect(screen.getByText("Checkout canceled")).toBeInTheDocument();
    expect(mockBroadcastCheckoutReturnSignal).toHaveBeenCalledWith("canceled");
    expect(mockConfirmCheckoutSession).not.toHaveBeenCalled();
  });
});
