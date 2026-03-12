import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { SubscriptionCard } from "./SubscriptionCard";

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  toastSuccess: vi.fn(),
  canAdmin: true,
  canEdit: true,
  changeTierMutate: vi.fn(),
  cancelMutate: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mocks.navigateMock };
});

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ canAdmin: mocks.canAdmin, canEdit: mocks.canEdit }),
}));

vi.mock("../hooks/use-tenant-detail", () => ({
  useChangeTier: () => ({ mutate: mocks.changeTierMutate, isPending: false }),
  useCancelSubscription: () => ({
    mutate: mocks.cancelMutate,
    isPending: false,
  }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} />
  ),
}));

describe("SubscriptionCard", () => {
  it("shows admin actions and triggers Create Invoice navigation", async () => {
    mocks.canAdmin = true;
    mocks.canEdit = true;

    render(
      <MemoryRouter>
        <SubscriptionCard
          tenant={{
            tenantId: "t-1",
            eid: "test---eid",
            companyName: "Acme",
            tier: "pro",
            subscriptionStatus: "active",
            seatLimit: 10,
            currentPeriodEnds: "2026-04-01T00:00:00Z",
            trialEndsAt: "2026-03-20T00:00:00Z",
            stripeSubscriptionId: "sub_123",
            signupDate: null,
            users: [],
            featureOverrides: [],
            recentAuditLogs: [],
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("stripe-link")).toHaveAttribute(
      "href",
      "https://dashboard.stripe.com/subscriptions/sub_123",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Create Invoice" }),
    );
    expect(mocks.navigateMock).toHaveBeenCalledWith(
      "/invoicing/create?eid=test---eid",
    );
  });

  it("hides admin/editor actions when permissions are missing", () => {
    mocks.canAdmin = false;
    mocks.canEdit = false;

    render(
      <MemoryRouter>
        <SubscriptionCard
          tenant={{
            tenantId: "t-1",
            eid: "test---eid",
            companyName: "Acme",
            tier: "pro",
            subscriptionStatus: "active",
            seatLimit: 10,
            currentPeriodEnds: null,
            trialEndsAt: null,
            stripeSubscriptionId: "sub_123",
            signupDate: null,
            users: [],
            featureOverrides: [],
            recentAuditLogs: [],
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Change Tier")).toBeNull();
    expect(screen.queryByText("Cancel Subscription")).toBeNull();
    expect(screen.queryByText("Create Invoice")).toBeNull();
    expect(screen.queryByTestId("stripe-link")).toBeNull();
  });

  it("calls changeTier mutation when confirming tier change", async () => {
    mocks.canAdmin = true;
    mocks.canEdit = true;
    mocks.changeTierMutate.mockImplementationOnce(
      (_vars: unknown, opts: { onSuccess?: () => void }) => {
        opts.onSuccess?.();
      },
    );

    render(
      <MemoryRouter>
        <SubscriptionCard
          tenant={{
            tenantId: "t-1",
            eid: "test---eid",
            companyName: "Acme",
            tier: "pro",
            subscriptionStatus: "active",
            seatLimit: 10,
            currentPeriodEnds: null,
            trialEndsAt: null,
            stripeSubscriptionId: null,
            signupDate: null,
            users: [],
            featureOverrides: [],
            recentAuditLogs: [],
          }}
        />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change Tier" }));
    expect(screen.getByText("New Tier")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(mocks.changeTierMutate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t-1" }),
      expect.any(Object),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Tier changed successfully",
    );
  });

  it("calls cancel subscription mutation when confirming cancel", async () => {
    mocks.canAdmin = true;
    mocks.canEdit = false;
    mocks.cancelMutate.mockImplementationOnce(
      (_vars: unknown, opts: { onSuccess?: () => void }) => {
        opts.onSuccess?.();
      },
    );

    render(
      <MemoryRouter>
        <SubscriptionCard
          tenant={{
            tenantId: "t-1",
            eid: "test---eid",
            companyName: "Acme",
            tier: "pro",
            subscriptionStatus: "active",
            seatLimit: 10,
            currentPeriodEnds: null,
            trialEndsAt: null,
            stripeSubscriptionId: null,
            signupDate: null,
            users: [],
            featureOverrides: [],
            recentAuditLogs: [],
          }}
        />
      </MemoryRouter>,
    );

    const cancelButtons = screen.getAllByRole("button", {
      name: "Cancel Subscription",
    });
    await userEvent.click(cancelButtons[0] as HTMLElement);

    const confirmButtons = screen.getAllByRole("button", {
      name: "Cancel Subscription",
    });
    await userEvent.click(
      confirmButtons[confirmButtons.length - 1] as HTMLElement,
    );

    expect(mocks.cancelMutate).toHaveBeenCalledWith(
      { tenantId: "t-1" },
      expect.any(Object),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Subscription canceled");
  });
});
