import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { InvoiceResultCard } from "./InvoiceResultCard";

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  canAdmin: true,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mocks.navigateMock };
});

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ canAdmin: mocks.canAdmin }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccessMock,
  },
}));

describe("InvoiceResultCard", () => {
  it("copies invoice URL when present", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <InvoiceResultCard
            tenantEid="test---tenant"
            onReset={vi.fn()}
            result={{
              invoiceUrl: "https://invoice.test",
              subscriptionId: "sub_1",
              invoiceStatus: "open",
              amount: 5000,
              dueDate: null,
              stripeInvoiceId: null,
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByText("https://invoice.test"));
    expect(mocks.toastSuccessMock).toHaveBeenCalledWith("Copied!");
  });

  it("refreshes invoices when invoice URL is not yet available", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <InvoiceResultCard
            tenantEid="test---tenant"
            onReset={vi.fn()}
            result={{
              invoiceUrl: null,
              subscriptionId: "sub_1",
              invoiceStatus: "draft",
              amount: 5000,
              dueDate: null,
              stripeInvoiceId: "in_1",
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["invoices"] });
  });

  it("supports reset and navigation actions", async () => {
    const onReset = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <InvoiceResultCard
            tenantEid="eid with spaces"
            onReset={onReset}
            result={{
              invoiceUrl: "https://invoice.test",
              subscriptionId: "sub_1",
              invoiceStatus: "open",
              amount: 5000,
              dueDate: null,
              stripeInvoiceId: null,
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Create Another" }));
    expect(onReset).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "View Tenant" }));
    expect(mocks.navigateMock).toHaveBeenCalledWith(
      "/tenants?search=eid%20with%20spaces",
    );
  });

  it("shows View in Stripe only for admins", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    mocks.canAdmin = true;
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <InvoiceResultCard
            tenantEid="test---tenant"
            onReset={vi.fn()}
            result={{
              invoiceUrl: "https://invoice.test",
              subscriptionId: "sub_1",
              invoiceStatus: "open",
              amount: 5000,
              dueDate: null,
              stripeInvoiceId: null,
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("View in Stripe")).toBeInTheDocument();

    mocks.canAdmin = false;
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <InvoiceResultCard
            tenantEid="test---tenant"
            onReset={vi.fn()}
            result={{
              invoiceUrl: "https://invoice.test",
              subscriptionId: "sub_1",
              invoiceStatus: "open",
              amount: 5000,
              dueDate: null,
              stripeInvoiceId: null,
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryByText("View in Stripe")).toBeNull();
  });
});
