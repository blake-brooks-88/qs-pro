import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DevSubscriptionPanel } from "@/components/dev/DevSubscriptionPanel";

vi.mock("@/hooks/use-dev-tools", () => ({
  useSetTrialDays: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateCheckout: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelSubscription: () => ({ mutate: vi.fn(), isPending: false }),
  useResetToFree: () => ({ mutate: vi.fn(), isPending: false }),
  useSetSubscriptionState: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-tenant-features", () => ({
  useTenantFeatures: () => ({
    data: { tier: "free", features: {}, trial: null },
  }),
  featuresQueryKeys: { all: ["features"] },
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("DevSubscriptionPanel", () => {
  it("renders the DEV trigger button", () => {
    render(<DevSubscriptionPanel />, { wrapper: Wrapper });

    expect(screen.getByText("DEV")).toBeInTheDocument();
  });

  it("opens popover when trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<DevSubscriptionPanel />, { wrapper: Wrapper });

    await user.click(screen.getByText("DEV"));

    expect(screen.getByText("Dev Subscription Panel")).toBeInTheDocument();
  });

  it("shows current tier in the panel", async () => {
    const user = userEvent.setup();
    render(<DevSubscriptionPanel />, { wrapper: Wrapper });

    await user.click(screen.getByText("DEV"));

    expect(screen.getByText("Tier: free")).toBeInTheDocument();
  });

  it("has trial controls", async () => {
    const user = userEvent.setup();
    render(<DevSubscriptionPanel />, { wrapper: Wrapper });

    await user.click(screen.getByText("DEV"));

    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set Trial" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear Trial" }),
    ).toBeInTheDocument();
  });

  it("has checkout and danger zone action buttons", async () => {
    const user = userEvent.setup();
    render(<DevSubscriptionPanel />, { wrapper: Wrapper });

    await user.click(screen.getByText("DEV"));

    expect(
      screen.getByRole("button", { name: "Pro Checkout" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enterprise Checkout" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel Subscription" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset to Free" }),
    ).toBeInTheDocument();
  });

  it("shows trial status as No trial when trial is null", async () => {
    const user = userEvent.setup();
    render(<DevSubscriptionPanel />, { wrapper: Wrapper });

    await user.click(screen.getByText("DEV"));

    expect(screen.getByText("Trial: No trial")).toBeInTheDocument();
  });

  it("shows Stripe as Not connected for free tier", async () => {
    const user = userEvent.setup();
    render(<DevSubscriptionPanel />, { wrapper: Wrapper });

    await user.click(screen.getByText("DEV"));

    expect(screen.getByText("Stripe: Not connected")).toBeInTheDocument();
  });

  it("has interval selector in stripe controls", async () => {
    const user = userEvent.setup();
    render(<DevSubscriptionPanel />, { wrapper: Wrapper });

    await user.click(screen.getByText("DEV"));

    const intervalSelect = screen.getByDisplayValue("Monthly");
    expect(intervalSelect).toBeInTheDocument();
  });

  it("has subscription state section with tier selector and Set State button", async () => {
    const user = userEvent.setup();
    render(<DevSubscriptionPanel />, { wrapper: Wrapper });

    await user.click(screen.getByText("DEV"));

    expect(screen.getByText("Subscription State")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set State" }),
    ).toBeInTheDocument();
  });
});
