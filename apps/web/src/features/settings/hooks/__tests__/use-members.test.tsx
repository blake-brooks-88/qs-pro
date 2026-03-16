import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockToast } from "@/test/mocks/sonner";

import { useChangeRole, useTransferOwnership } from "../use-members";

vi.mock("@/services/admin-api", () => ({
  changeRole: vi.fn(),
  getMembers: vi.fn(),
  transferOwnership: vi.fn(),
}));

import { changeRole, transferOwnership } from "@/services/admin-api";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("use-members mutations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("toasts the Error message when change role fails with an Error", async () => {
    vi.mocked(changeRole).mockRejectedValueOnce(new Error("bad"));

    const { result } = renderHook(() => useChangeRole(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ userId: "user-1", role: "admin" }),
    ).rejects.toThrow("bad");

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("bad");
    });
  });

  it("toasts a fallback message when change role fails with a non-Error", async () => {
    vi.mocked(changeRole).mockRejectedValueOnce("nope");

    const { result } = renderHook(() => useChangeRole(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ userId: "user-1", role: "admin" }),
    ).rejects.toBe("nope");

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to update role");
    });
  });

  it("toasts the Error message when transfer ownership fails with an Error", async () => {
    vi.mocked(transferOwnership).mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useTransferOwnership(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync("user-2")).rejects.toThrow("boom");

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("boom");
    });
  });

  it("toasts a fallback message when transfer ownership fails with a non-Error", async () => {
    vi.mocked(transferOwnership).mockRejectedValueOnce({ reason: "x" });

    const { result } = renderHook(() => useTransferOwnership(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync("user-2")).rejects.toMatchObject({
      reason: "x",
    });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        "Failed to transfer ownership",
      );
    });
  });
});
