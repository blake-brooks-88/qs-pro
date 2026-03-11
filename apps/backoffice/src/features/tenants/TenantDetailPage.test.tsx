import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { TenantDetailPage } from "./TenantDetailPage";

const mockTenant = {
  tenantId: "t-001",
  eid: "12345678",
  companyName: "Acme Corp",
  tier: "pro",
  subscriptionStatus: "active",
  seatLimit: 10,
  currentPeriodEnds: "2026-04-01T00:00:00Z",
  trialEndsAt: null,
  stripeSubscriptionId: "sub_abc123",
  signupDate: "2025-06-15T00:00:00Z",
  users: [
    {
      name: "Alice",
      email: "alice@acme.com",
      lastActiveDate: "2026-03-07T12:00:00Z",
    },
    { name: "Bob", email: "bob@acme.com", lastActiveDate: null },
  ],
  featureOverrides: [{ featureKey: "advancedAutocomplete", enabled: true }],
  recentAuditLogs: [
    {
      id: "log-1",
      backofficeUserId: "bo-user-1",
      eventType: "tenant.tier_changed",
      metadata: { from: "free", to: "pro" },
      createdAt: "2026-03-08T10:00:00Z",
    },
  ],
};

let mockRole = "viewer";

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    role: mockRole,
    canView: true,
    canEdit: mockRole === "editor" || mockRole === "admin",
    canAdmin: mockRole === "admin",
    isAtLeast: (r: string) => {
      const h: Record<string, number> = { viewer: 0, editor: 1, admin: 2 };
      return (h[mockRole] ?? 0) >= (h[r] ?? 0);
    },
  }),
}));

vi.mock("./hooks/use-tenant-detail", () => ({
  useTenantDetail: () => ({
    data: mockTenant,
    isLoading: false,
    isError: false,
  }),
  useFeatureOverrides: () => ({
    data: [{ featureKey: "advancedAutocomplete", enabled: true }],
  }),
  useSetFeatureOverride: () => ({ mutate: vi.fn() }),
  useRemoveFeatureOverride: () => ({ mutate: vi.fn() }),
  useChangeTier: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelSubscription: () => ({ mutate: vi.fn(), isPending: false }),
}));

function renderPage(role: string = "viewer") {
  mockRole = role;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/tenants/t-001"]}>
        <Routes>
          <Route path="/tenants/:tenantId" element={<TenantDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TenantDetailPage", () => {
  it("should render subscription card for all roles", () => {
    renderPage("viewer");
    expect(screen.getByText("Subscription")).toBeInTheDocument();
  });

  it("should render user list card for all roles", () => {
    renderPage("viewer");
    expect(screen.getByText("Users")).toBeInTheDocument();
  });

  it("should hide feature overrides card from viewers", () => {
    renderPage("viewer");
    expect(screen.queryByText("Feature Overrides")).not.toBeInTheDocument();
  });

  it("should hide feature overrides card from editors", () => {
    renderPage("editor");
    expect(screen.queryByText("Feature Overrides")).not.toBeInTheDocument();
  });

  it("should show feature overrides card for admins", () => {
    renderPage("admin");
    expect(screen.getByText("Feature Overrides")).toBeInTheDocument();
  });

  it("should hide tier change button from non-admins", () => {
    renderPage("editor");
    expect(screen.queryByText("Change Tier")).not.toBeInTheDocument();
  });

  it("should show tier change button for admins", () => {
    renderPage("admin");
    expect(screen.getByText("Change Tier")).toBeInTheDocument();
  });

  it("should show Stripe dashboard link only for admins", () => {
    renderPage("admin");
    expect(screen.getByTestId("stripe-link")).toHaveAttribute(
      "href",
      "https://dashboard.stripe.com/subscriptions/sub_abc123",
    );
  });
});
