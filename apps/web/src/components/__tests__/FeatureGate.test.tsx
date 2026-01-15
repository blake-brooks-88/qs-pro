import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { FeatureGate } from "@/components/FeatureGate";

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

const mockFeatures = {
  basicLinting: true,
  syntaxHighlighting: true,
  quickFixes: false,
  minimap: false,
  advancedAutocomplete: false,
  teamSnippets: false,
  auditLogs: false,
  deployToAutomation: false,
};

describe("FeatureGate", () => {
  beforeEach(() => {
    server.resetHandlers();
    server.use(
      http.get("/api/features", () => {
        return HttpResponse.json(mockFeatures);
      }),
    );
  });

  it("renders children without badge when feature enabled", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    render(
      <FeatureGate feature="basicLinting" variant="button">
        <button>Test Button</button>
      </FeatureGate>,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("Test Button")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /feature/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("renders children with premium badge when feature disabled", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    render(
      <FeatureGate feature="quickFixes" variant="button">
        <button>Test Button</button>
      </FeatureGate>,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("Test Button")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /pro feature/i }),
      ).toBeInTheDocument();
    });
  });

  it("renders locked button variant with disabled styling", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    render(
      <FeatureGate feature="quickFixes" variant="button">
        <button>Quick Fixes</button>
      </FeatureGate>,
      { wrapper },
    );

    await waitFor(() => {
      const button = screen.getByText("Quick Fixes");
      const container = button.closest(".pointer-events-none");
      expect(container).toBeInTheDocument();
    });
  });

  it("renders locked panel variant with backdrop", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    render(
      <FeatureGate feature="teamSnippets" variant="panel">
        <div>Team Snippets Content</div>
      </FeatureGate>,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("Team Snippets Content")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /enterprise feature/i }),
      ).toBeInTheDocument();
    });
  });

  it("renders locked menuItem variant", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    render(
      <FeatureGate feature="auditLogs" variant="menuItem">
        <div role="menuitem">Audit Logs</div>
      </FeatureGate>,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("Audit Logs")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /enterprise feature/i }),
      ).toBeInTheDocument();
    });
  });
});
