import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TwoFactorSetupPage } from "./TwoFactorSetupPage";

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  enableMock: vi.fn(),
  verifyTotpMock: vi.fn(),
  getSessionMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mocks.navigateMock };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    twoFactor: {
      enable: mocks.enableMock,
      verifyTotp: mocks.verifyTotpMock,
    },
    getSession: mocks.getSessionMock,
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastErrorMock,
    success: mocks.toastSuccessMock,
  },
}));

describe("TwoFactorSetupPage", () => {
  it("moves from password step to scan step when enable returns totpURI", async () => {
    mocks.enableMock.mockResolvedValueOnce({
      data: { totpURI: "otpauth://totp/test", backupCodes: ["a", "b"] },
      error: null,
    });

    render(<TwoFactorSetupPage />);
    await userEvent.type(screen.getByLabelText("Password"), "pw");
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to 2FA Setup" }),
    );

    expect(await screen.findByText("Scan QR Code")).toBeInTheDocument();
    expect(screen.getByLabelText("Verification Code")).toBeInTheDocument();
  });

  it("shows backup codes after successful verification when provided", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
    });

    mocks.enableMock.mockResolvedValueOnce({
      data: { totpURI: "otpauth://totp/test", backupCodes: ["code-1"] },
      error: null,
    });
    mocks.verifyTotpMock.mockResolvedValueOnce({ data: {}, error: null });
    mocks.getSessionMock.mockResolvedValueOnce({});

    render(<TwoFactorSetupPage />);
    await userEvent.type(screen.getByLabelText("Password"), "pw");
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to 2FA Setup" }),
    );

    await userEvent.type(screen.getByLabelText("Verification Code"), "123456");
    await userEvent.click(
      screen.getByRole("button", { name: "Verify & Complete Setup" }),
    );

    expect(await screen.findByText("Backup Codes")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Copy Backup Codes" }),
    );
    expect(mocks.toastSuccessMock).toHaveBeenCalledWith(
      "Backup codes copied to clipboard",
    );
  });
});
