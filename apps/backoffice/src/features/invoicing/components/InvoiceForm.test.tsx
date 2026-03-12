import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvoiceForm } from "./InvoiceForm";

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

const mockRefetch = vi.fn();
const mockMutate = vi.fn();

const mockLookupData = {
  eid: "test---bo-invoice-form",
  companyName: "Acme Corp",
  userCount: 5,
  tier: "pro",
  subscriptionStatus: "active",
  signupDate: "2025-06-15T00:00:00Z",
};

let mockEidLookupReturn: Record<string, unknown> = {
  data: undefined,
  refetch: mockRefetch,
  isFetching: false,
  isError: false,
  fetchStatus: "idle",
};

let mockCreateReturn: Record<string, unknown> = {
  mutate: mockMutate,
  isPending: false,
};

vi.mock("../hooks/use-invoicing", () => ({
  useEidLookup: () => mockEidLookupReturn,
  useCreateInvoicedSubscription: () => mockCreateReturn,
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    role: "admin",
    canView: true,
    canEdit: true,
    canAdmin: true,
    isAtLeast: () => true,
  }),
}));

function renderForm(initialEntries: string[] = ["/invoicing/create"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <InvoiceForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("InvoiceForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEidLookupReturn = {
      data: undefined,
      refetch: mockRefetch,
      isFetching: false,
      isError: false,
      fetchStatus: "idle",
    };
    mockCreateReturn = {
      mutate: mockMutate,
      isPending: false,
    };
  });

  it("should pre-fill EID from URL query parameter", () => {
    renderForm(["/invoicing/create?eid=123"]);
    const eidInput = screen.getByLabelText(/enterprise id/i);
    expect(eidInput).toHaveValue("123");
  });

  it("should show tenant confirmation card after successful EID lookup", () => {
    mockEidLookupReturn = {
      ...mockEidLookupReturn,
      data: mockLookupData,
    };
    renderForm();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("should show error message when EID lookup fails", () => {
    mockEidLookupReturn = {
      ...mockEidLookupReturn,
      data: undefined,
      isError: true,
      fetchStatus: "idle",
    };
    renderForm();
    expect(screen.getByText(/no tenant found/i)).toBeInTheDocument();
  });

  it("should disable step 2 fields until tenant is confirmed", () => {
    renderForm();
    const tierSelect = screen.getByLabelText(/tier/i);
    expect(tierSelect).toBeDisabled();
    const seatInput = screen.getByLabelText(/seat count/i);
    expect(seatInput).toBeDisabled();
  });

  it("should validate required fields before submission", async () => {
    mockEidLookupReturn = {
      ...mockEidLookupReturn,
      data: mockLookupData,
    };
    renderForm();

    await userEvent.type(screen.getByLabelText(/enterprise id/i), mockLookupData.eid);
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmBtn);

    const submitBtn = screen.getByRole("button", {
      name: /create invoiced subscription/i,
    });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Customer email is required"),
      ).toBeInTheDocument();
    });
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("should call createInvoicedSubscription mutation on valid submit", async () => {
    mockEidLookupReturn = {
      ...mockEidLookupReturn,
      data: mockLookupData,
    };
    renderForm();

    await userEvent.type(screen.getByLabelText(/enterprise id/i), mockLookupData.eid);
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmBtn);

    const emailInput = screen.getByLabelText(/customer email/i);
    const nameInput = screen.getByLabelText(/customer name/i);
    await userEvent.type(emailInput, "john@acme.com");
    await userEvent.type(nameInput, "John Doe");

    const submitBtn = screen.getByRole("button", {
      name: /create invoiced subscription/i,
    });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantEid: mockLookupData.eid,
          tier: "pro",
          interval: "monthly",
          seatCount: 1,
          paymentTerms: "net_30",
          customerEmail: "john@acme.com",
          customerName: "John Doe",
          companyName: "Acme Corp",
        }),
        expect.any(Object),
      );
    });
  });

  it("shows InvoiceResultCard on success and resets form", async () => {
    mockEidLookupReturn = {
      ...mockEidLookupReturn,
      data: mockLookupData,
    };

    mockMutate.mockImplementation(
      (_params: unknown, opts: { onSuccess: (d: unknown) => void }) => {
        opts.onSuccess({
          invoiceUrl: "https://invoice.stripe.com/i/test123",
          subscriptionId: "sub_123",
          invoiceStatus: "open",
          amount: 5000,
          dueDate: "2026-04-01T00:00:00Z",
          stripeInvoiceId: "in_abc",
        });
      },
    );

    renderForm();

    await userEvent.type(screen.getByLabelText(/enterprise id/i), mockLookupData.eid);
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await userEvent.type(screen.getByLabelText(/customer email/i), "john@acme.com");
    await userEvent.type(screen.getByLabelText(/customer name/i), "John Doe");

    await userEvent.click(
      screen.getByRole("button", { name: /create invoiced subscription/i }),
    );

    expect(await screen.findByText("Subscription Created")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Create Another" }));
    expect(screen.getByLabelText(/enterprise id/i)).toHaveValue("");
  });

  it("shows a toast when create mutation errors", async () => {
    mockEidLookupReturn = {
      ...mockEidLookupReturn,
      data: mockLookupData,
    };

    mockMutate.mockImplementationOnce(
      (_params: unknown, opts: { onError?: (e: Error) => void }) =>
        opts.onError?.(new Error("boom")),
    );

    renderForm();

    await userEvent.type(screen.getByLabelText(/enterprise id/i), mockLookupData.eid);
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await userEvent.type(screen.getByLabelText(/customer email/i), "john@acme.com");
    await userEvent.type(screen.getByLabelText(/customer name/i), "John Doe");

    await userEvent.click(
      screen.getByRole("button", { name: /create invoiced subscription/i }),
    );

    expect(mocks.toastError).toHaveBeenCalledWith("boom");
  });
});
