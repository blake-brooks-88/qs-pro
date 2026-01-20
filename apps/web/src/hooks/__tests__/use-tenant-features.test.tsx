import { type TenantFeatures } from "@qpp/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTenantFeatures } from "@/hooks/use-tenant-features";
import * as featuresService from "@/services/features";

vi.mock("@/services/features", () => ({
  getTenantFeatures: vi.fn(),
}));

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
    const mockFeatures: TenantFeatures = {
      basicLinting: true,
      syntaxHighlighting: true,
      quickFixes: false,
      minimap: false,
      advancedAutocomplete: false,
      teamSnippets: false,
      auditLogs: false,
    };
    const getTenantFeaturesMock = vi.mocked(featuresService.getTenantFeatures);
    getTenantFeaturesMock.mockResolvedValueOnce(mockFeatures);

    // Act
    const { result } = renderHook(() => useTenantFeatures("tenant-1"), {
      wrapper,
    });

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(getTenantFeaturesMock).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockFeatures);
  });
});
