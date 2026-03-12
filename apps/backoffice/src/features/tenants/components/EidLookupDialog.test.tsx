import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EidLookupDialog } from "./EidLookupDialog";

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  refetchMock: vi.fn().mockResolvedValue(undefined),
  useEidLookupMock: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mocks.navigateMock };
});

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("@/features/tenants/hooks/use-tenants", () => ({
  useEidLookup: (eid: string) => mocks.useEidLookupMock(eid),
}));

describe("EidLookupDialog", () => {
  it("refetches and navigates to tenant search and invoicing", async () => {
    mocks.useEidLookupMock.mockReturnValue({
      data: {
        eid: "test---eid",
        companyName: "Acme",
        userCount: 1,
        tier: "pro",
        subscriptionStatus: "active",
        signupDate: null,
      },
      refetch: mocks.refetchMock,
      isFetching: false,
      isError: false,
      fetchStatus: "success",
    });

    const onOpenChange = vi.fn();
    render(<EidLookupDialog open onOpenChange={onOpenChange} />);

    await userEvent.type(
      screen.getByPlaceholderText("Enter EID..."),
      "test---eid",
    );
    await userEvent.click(screen.getByRole("button", { name: "Lookup" }));
    expect(mocks.refetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "View Details" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.navigateMock).toHaveBeenCalledWith(
      "/tenants?search=test---eid",
    );
  });

  it("shows not found message when lookup fails", async () => {
    mocks.useEidLookupMock.mockReturnValue({
      data: undefined,
      refetch: mocks.refetchMock,
      isFetching: false,
      isError: true,
      fetchStatus: "success",
    });

    render(<EidLookupDialog open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("Enter EID..."), "x");
    await userEvent.click(screen.getByRole("button", { name: "Lookup" }));

    expect(
      await screen.findByText(/No tenant found for EID/i),
    ).toBeInTheDocument();
  });
});
