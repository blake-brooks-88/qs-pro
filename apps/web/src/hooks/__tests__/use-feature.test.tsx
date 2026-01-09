import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFeature } from "@/hooks/use-feature";

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

describe("useFeature", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true for enabled feature", async () => {
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
    const { result } = renderHook(() => useFeature("basicLinting"), {
      wrapper,
    });

    // Assert
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns false for disabled feature", async () => {
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
    const { result } = renderHook(() => useFeature("quickFixes"), {
      wrapper,
    });

    // Assert
    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns false while loading (fail-closed)", () => {
    // Arrange
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const fetchMock = vi.fn().mockImplementationOnce(
      () =>
        new Promise(() => {
          // Never resolves - simulates loading state
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // Act
    const { result } = renderHook(() => useFeature("basicLinting"), {
      wrapper,
    });

    // Assert - should be false immediately (fail-closed)
    expect(result.current).toBe(false);
  });
});
