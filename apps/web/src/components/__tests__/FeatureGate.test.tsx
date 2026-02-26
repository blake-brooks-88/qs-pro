import type { TenantFeaturesResponse } from "@qpp/shared-types";
import { getTierFeatures } from "@qpp/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { FeatureGate } from "@/components/FeatureGate";
import { featuresQueryKeys } from "@/hooks/use-tenant-features";

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

const seedTenantFeatures = (): TenantFeaturesResponse =>
  ({
    tier: "free",
    features: getTierFeatures("free"),
    trial: null,
  }) satisfies TenantFeaturesResponse;

describe("FeatureGate", () => {
  beforeEach(() => {
    // no-op: tests seed React Query cache directly
  });

  it("renders children without badge when feature enabled", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(featuresQueryKeys.tenant(), seedTenantFeatures());
    const wrapper = createWrapper(queryClient);

    render(
      <FeatureGate feature="basicLinting" variant="button">
        <button>Test Button</button>
      </FeatureGate>,
      { wrapper },
    );

    expect(screen.getByText("Test Button")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /feature/i }),
    ).not.toBeInTheDocument();
  });

  it("renders children with premium badge when feature disabled", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(featuresQueryKeys.tenant(), seedTenantFeatures());
    const wrapper = createWrapper(queryClient);

    render(
      <FeatureGate feature="quickFixes" variant="button">
        <button>Test Button</button>
      </FeatureGate>,
      { wrapper },
    );

    expect(screen.getByText("Test Button")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /pro feature/i }),
    ).toBeInTheDocument();
  });

  it("renders locked button variant with disabled styling", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(featuresQueryKeys.tenant(), seedTenantFeatures());
    const wrapper = createWrapper(queryClient);

    render(
      <FeatureGate feature="quickFixes" variant="button">
        <button>Quick Fixes</button>
      </FeatureGate>,
      { wrapper },
    );

    const button = screen.getByText("Quick Fixes");
    const container = button.closest(".pointer-events-none");
    expect(container).toBeInTheDocument();
  });

  it("renders locked panel variant with backdrop", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(featuresQueryKeys.tenant(), seedTenantFeatures());
    const wrapper = createWrapper(queryClient);

    render(
      <FeatureGate feature="teamSnippets" variant="panel">
        <div>Team Snippets Content</div>
      </FeatureGate>,
      { wrapper },
    );

    expect(screen.getByText("Team Snippets Content")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /enterprise feature/i }),
    ).toBeInTheDocument();
  });

  it("renders locked menuItem variant", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(featuresQueryKeys.tenant(), seedTenantFeatures());
    const wrapper = createWrapper(queryClient);

    render(
      <FeatureGate feature="auditLogs" variant="menuItem">
        <div role="menuitem">Audit Logs</div>
      </FeatureGate>,
      { wrapper },
    );

    expect(screen.getByText("Audit Logs")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /enterprise feature/i }),
    ).toBeInTheDocument();
  });
});
