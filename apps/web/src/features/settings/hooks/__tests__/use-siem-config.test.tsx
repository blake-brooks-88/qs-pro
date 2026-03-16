import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockToast } from "@/test/mocks/sonner";

import { useDeleteSiemConfig, useUpsertSiemConfig } from "../use-siem-config";

vi.mock("@/services/siem-api", () => ({
  deleteSiemConfig: vi.fn(),
  getSiemConfig: vi.fn(),
  testSiemWebhook: vi.fn(),
  upsertSiemConfig: vi.fn(),
}));

import { deleteSiemConfig, upsertSiemConfig } from "@/services/siem-api";

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

describe("use-siem-config mutations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("toasts the Error message when upsert fails with an Error", async () => {
    vi.mocked(upsertSiemConfig).mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useUpsertSiemConfig(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        webhookUrl: "https://x.test",
        secret: "a".repeat(16),
      }),
    ).rejects.toThrow("boom");

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("boom");
    });
  });

  it("toasts a fallback message when upsert fails with a non-Error", async () => {
    vi.mocked(upsertSiemConfig).mockRejectedValueOnce("nope");

    const { result } = renderHook(() => useUpsertSiemConfig(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        webhookUrl: "https://x.test",
        secret: "a".repeat(16),
      }),
    ).rejects.toBe("nope");

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        "Failed to save SIEM configuration",
      );
    });
  });

  it("toasts the Error message when delete fails with an Error", async () => {
    vi.mocked(deleteSiemConfig).mockRejectedValueOnce(new Error("nope"));

    const { result } = renderHook(() => useDeleteSiemConfig(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync()).rejects.toThrow("nope");

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("nope");
    });
  });

  it("toasts a fallback message when delete fails with a non-Error", async () => {
    vi.mocked(deleteSiemConfig).mockRejectedValueOnce({ reason: "x" });

    const { result } = renderHook(() => useDeleteSiemConfig(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync()).rejects.toMatchObject({
      reason: "x",
    });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        "Failed to delete SIEM configuration",
      );
    });
  });
});
