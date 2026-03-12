import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { InvoiceCreatePage } from "./InvoiceCreatePage";

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mocks.navigateMock };
});

vi.mock("./components/InvoiceForm", () => ({
  InvoiceForm: () => <div>Invoice Form</div>,
}));

describe("InvoiceCreatePage", () => {
  it("navigates back to /invoicing", async () => {
    render(
      <MemoryRouter>
        <InvoiceCreatePage />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole("button", { name: /back to invoices/i }));
    expect(mocks.navigateMock).toHaveBeenCalledWith("/invoicing");
  });
});

