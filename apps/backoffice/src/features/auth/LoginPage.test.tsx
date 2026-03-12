import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoginPage } from "./LoginPage";

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  signInEmailMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mocks.navigateMock };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: mocks.signInEmailMock,
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastErrorMock,
  },
}));

describe("LoginPage", () => {
  it("shows error message on invalid credentials", async () => {
    mocks.signInEmailMock.mockResolvedValueOnce({
      error: { message: "Invalid credentials" },
    });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
  });

  it("navigates to /2fa-setup on successful sign-in", async () => {
    mocks.signInEmailMock.mockResolvedValueOnce({ data: {}, error: null });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(mocks.navigateMock).toHaveBeenCalledWith("/2fa-setup");
  });

  it("shows toast on network error", async () => {
    mocks.signInEmailMock.mockRejectedValueOnce(new Error("network"));

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(mocks.toastErrorMock).toHaveBeenCalledWith(
      "Network error. Please try again.",
    );
  });
});

