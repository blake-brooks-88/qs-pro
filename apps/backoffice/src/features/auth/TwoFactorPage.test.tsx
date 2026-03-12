import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { TwoFactorPage } from "./TwoFactorPage";

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  verifyTotpMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mocks.navigateMock };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    twoFactor: {
      verifyTotp: mocks.verifyTotpMock,
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastErrorMock,
  },
}));

describe("TwoFactorPage", () => {
  it("shows error and clears input when verification fails", async () => {
    mocks.verifyTotpMock.mockResolvedValueOnce({
      error: { message: "Invalid code" },
    });

    render(
      <MemoryRouter>
        <TwoFactorPage />
      </MemoryRouter>,
    );
    const input = screen.getByPlaceholderText("000000");
    await userEvent.type(input, "123456");

    expect(await screen.findByText("Invalid code")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("navigates to / on successful verification", async () => {
    mocks.verifyTotpMock.mockResolvedValueOnce({ data: {}, error: null });

    render(
      <MemoryRouter>
        <TwoFactorPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByPlaceholderText("000000"), "123456");

    expect(mocks.navigateMock).toHaveBeenCalledWith("/");
  });
});
