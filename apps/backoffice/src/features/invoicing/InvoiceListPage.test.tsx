import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { InvoiceListPage } from "./InvoiceListPage";

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mocks.navigateMock };
});

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ canEdit: true }),
}));

vi.mock("./hooks/use-invoicing", () => ({
  useInvoices: () => ({
    data: { invoices: [], hasMore: true, nextCursor: "next" },
    isLoading: false,
  }),
}));

describe("InvoiceListPage", () => {
  it("renders and allows refresh + create invoice", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.invalidateQueries = mocks.invalidateQueriesMock as never;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <InvoiceListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Invoices")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(mocks.invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["invoices"],
    });

    await userEvent.click(screen.getByRole("button", { name: "Create Invoice" }));
    expect(mocks.navigateMock).toHaveBeenCalledWith("/invoicing/create");

    expect(screen.getByRole("button", { name: "Load More" })).toBeDisabled();
  });
});

