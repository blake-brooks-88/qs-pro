import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/store/auth-store";
import { server } from "@/test/mocks/server";
import {
  createTenantFeaturesStub,
  createTenantStub,
  createUserStub,
} from "@/test/stubs";

import { SettingsPage } from "../SettingsPage";

vi.mock("../components/MembersTab", () => ({
  MembersTab: () => <div data-testid="members-tab" />,
}));

vi.mock("../components/BillingTab", () => ({
  BillingTab: () => <div data-testid="billing-tab" />,
}));

vi.mock("../components/AuditLogTab", () => ({
  AuditLogTab: () => <div data-testid="audit-log-tab" />,
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  return {
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
    queryClient,
  };
}

function setupAuth(role: "owner" | "admin" | "member" = "admin") {
  useAuthStore.setState({
    user: createUserStub({ role }),
    tenant: createTenantStub(),
    csrfToken: "csrf",
  });
}

function setupFeaturesWithAuditLogs() {
  server.use(
    http.get("/api/features", () => {
      return HttpResponse.json(
        createTenantFeaturesStub({
          tier: "enterprise",
        }),
      );
    }),
  );
}

function findTabButton(name: string): HTMLElement | null {
  return screen.queryByRole("button", { name });
}

describe("SettingsPage", () => {
  it("redirects non-admin users by calling onBack", () => {
    setupAuth("member");

    const onBack = vi.fn();
    renderWithProviders(<SettingsPage onBack={onBack} />);

    expect(onBack).toHaveBeenCalled();
  });

  it("renders for admin users without calling onBack", () => {
    setupAuth("admin");

    const onBack = vi.fn();
    renderWithProviders(<SettingsPage onBack={onBack} />);

    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByTestId("members-tab")).toBeInTheDocument();
  });

  it("shows billing tab button for owner role", () => {
    setupAuth("owner");

    renderWithProviders(<SettingsPage onBack={vi.fn()} />);

    expect(findTabButton("Members")).not.toBeNull();
    expect(findTabButton("Billing")).not.toBeNull();
  });

  it("shows only members tab button for admin role", () => {
    setupAuth("admin");

    renderWithProviders(<SettingsPage onBack={vi.fn()} />);

    expect(findTabButton("Members")).not.toBeNull();
    expect(findTabButton("Billing")).toBeNull();
  });

  it("switches to billing tab content when owner clicks billing tab", async () => {
    setupAuth("owner");

    renderWithProviders(<SettingsPage onBack={vi.fn()} />);

    const billingTab = findTabButton("Billing");
    expect(billingTab).not.toBeNull();
    await userEvent.click(billingTab as HTMLElement);

    expect(screen.getByTestId("billing-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("members-tab")).not.toBeInTheDocument();
  });

  it("shows audit log tab when features include auditLogs", async () => {
    setupAuth("owner");
    setupFeaturesWithAuditLogs();

    renderWithProviders(<SettingsPage onBack={vi.fn()} />);

    await vi.waitFor(() => {
      expect(findTabButton("Audit Log")).not.toBeNull();
    });

    const auditTab = findTabButton("Audit Log");
    expect(auditTab).not.toBeNull();
    await userEvent.click(auditTab as HTMLElement);

    expect(screen.getByTestId("audit-log-tab")).toBeInTheDocument();
  });

  it("does not show audit log tab on free tier", () => {
    setupAuth("owner");

    renderWithProviders(<SettingsPage onBack={vi.fn()} />);

    expect(findTabButton("Audit Log")).toBeNull();
  });

  it("calls onBack when back button is clicked", async () => {
    setupAuth("admin");

    const onBack = vi.fn();
    renderWithProviders(<SettingsPage onBack={onBack} />);

    const backButton = screen
      .getAllByRole("button")
      .find((btn) => btn !== findTabButton("Members"));
    expect(backButton).toBeDefined();
    await userEvent.click(backButton as HTMLElement);

    expect(onBack).toHaveBeenCalled();
  });

  it("defaults to rendering members tab content", () => {
    setupAuth("admin");

    renderWithProviders(<SettingsPage onBack={vi.fn()} />);

    expect(screen.getByTestId("members-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("billing-tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("audit-log-tab")).not.toBeInTheDocument();
  });
});
