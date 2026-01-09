import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTenantFeatures } from "@/hooks/use-tenant-features";

const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

describe("useTenantFeatures", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches from /api/features on mount", async () => {
    // Arrange
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const mockFeatures = {
      basicLinting: true,
      syntaxHighlighting: true,
      quickFixes: false,
      minimap: false,
      advancedAutocomplete: false,
      teamSnippets: false,
      auditLogs: false,
    };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockFeatures,
    });
    vi.stubGlobal("fetch", fetchMock);

    // Act
    const { result } = renderHook(() => useTenantFeatures("tenant-1"), {
      wrapper,
    });

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/features",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result.current.data).toEqual(mockFeatures);
  });
});
