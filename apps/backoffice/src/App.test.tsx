import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/layouts/AuthLayout", () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ user: { name: "User" }, role: "viewer" }),
}));

vi.mock("@/features/auth/LoginPage", () => ({
  LoginPage: () => <div>Login</div>,
}));
vi.mock("@/features/auth/TwoFactorPage", () => ({
  TwoFactorPage: () => <div>2FA</div>,
}));
vi.mock("@/features/auth/TwoFactorSetupPage", () => ({
  TwoFactorSetupPage: () => <div>2FA Setup</div>,
}));
vi.mock("@/features/tenants/TenantListPage", () => ({
  TenantListPage: () => <div>Tenants</div>,
}));
vi.mock("@/features/tenants/TenantDetailPage", () => ({
  TenantDetailPage: () => <div>Tenant Detail</div>,
}));
vi.mock("@/features/invoicing/InvoiceListPage", () => ({
  InvoiceListPage: () => <div>Invoices</div>,
}));
vi.mock("@/features/invoicing/InvoiceCreatePage", () => ({
  InvoiceCreatePage: () => <div>Create Invoice</div>,
}));
vi.mock("@/features/settings/SettingsPage", () => ({
  SettingsPage: () => <div>Settings</div>,
}));

describe("App routing", () => {
  it("shows 404 page for unknown route", () => {
    window.history.pushState({}, "", "/does-not-exist");
    render(<App />);
    expect(screen.getByText("Page not found")).toBeInTheDocument();
  });

  it("redirects index route to /tenants", async () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    await waitFor(() => {
      expect(window.location.pathname).toBe("/tenants");
    });
  });
});
