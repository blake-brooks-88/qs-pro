import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { TenantListPage } from "./TenantListPage";

vi.mock("./hooks/use-tenants", () => ({
  useTenants: () => ({ data: { data: [], total: 0 }, isLoading: false }),
}));

vi.mock("./components/TenantTable", () => ({
  TenantTable: () => <div>Tenant Table</div>,
}));

vi.mock("./components/EidLookupDialog", () => ({
  EidLookupDialog: ({ open }: { open: boolean }) =>
    open ? <div>EID Dialog</div> : null,
}));

describe("TenantListPage", () => {
  it("renders and opens EID lookup dialog", async () => {
    render(
      <MemoryRouter initialEntries={["/tenants?search=acme"]}>
        <TenantListPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Tenants")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "EID Lookup" }));
    expect(screen.getByText("EID Dialog")).toBeInTheDocument();
  });
});
