import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
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
    server.resetHandlers();
  });

  it("returns true for enabled feature", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/features", () => {
        return HttpResponse.json({
          basicLinting: true,
          syntaxHighlighting: true,
          quickFixes: false,
          minimap: false,
          advancedAutocomplete: false,
          teamSnippets: false,
          auditLogs: false,
          deployToAutomation: false,
        });
      }),
    );

    const { result } = renderHook(() => useFeature("basicLinting"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns false for disabled feature", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/features", () => {
        return HttpResponse.json({
          basicLinting: true,
          syntaxHighlighting: true,
          quickFixes: false,
          minimap: false,
          advancedAutocomplete: false,
          teamSnippets: false,
          auditLogs: false,
          deployToAutomation: false,
        });
      }),
    );

    const { result } = renderHook(() => useFeature("quickFixes"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns false while loading (fail-closed)", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/features", async () => {
        await new Promise(() => {});
      }),
    );

    const { result } = renderHook(() => useFeature("basicLinting"), {
      wrapper,
    });

    expect(result.current).toBe(false);
  });
});
