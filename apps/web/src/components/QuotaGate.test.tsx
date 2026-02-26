import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { QuotaCountBadge, QuotaGate } from "./QuotaGate";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("QuotaGate", () => {
  it("renders children when under quota", () => {
    render(
      <QuotaGate current={2} limit={5} resourceName="Saved Queries">
        <button>Save Query</button>
      </QuotaGate>,
    );

    expect(
      screen.getByRole("button", { name: "Save Query" }),
    ).toBeInTheDocument();
  });

  it("shows blocked content when at quota", () => {
    render(
      <QuotaGate current={5} limit={5} resourceName="Saved Queries">
        <button>Save Query</button>
      </QuotaGate>,
      { wrapper: createWrapper() },
    );

    expect(
      screen.queryByRole("button", { name: "Save Query" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Limit Reached/)).toBeInTheDocument();
  });

  it("renders children for Pro users (limit = null)", () => {
    render(
      <QuotaGate current={100} limit={null} resourceName="Saved Queries">
        <button>Save Query</button>
      </QuotaGate>,
    );

    expect(
      screen.getByRole("button", { name: "Save Query" }),
    ).toBeInTheDocument();
  });

  it("shows count when showCount is true", () => {
    render(
      <QuotaGate current={3} limit={5} resourceName="Saved Queries" showCount>
        <button>Save Query</button>
      </QuotaGate>,
    );

    expect(screen.getByText("Saved Queries (3/5)")).toBeInTheDocument();
  });

  it("shows warning when near quota", () => {
    render(
      <QuotaGate current={4} limit={5} resourceName="Saved Queries" showCount>
        <button>Save Query</button>
      </QuotaGate>,
    );

    expect(screen.getByText(/Almost at limit/)).toBeInTheDocument();
  });

  it("renders custom blocked content when provided", () => {
    render(
      <QuotaGate
        current={5}
        limit={5}
        resourceName="Saved Queries"
        blockedContent={<div data-testid="custom-blocked">Custom blocked</div>}
      >
        <button>Save Query</button>
      </QuotaGate>,
    );

    expect(screen.getByTestId("custom-blocked")).toBeInTheDocument();
    expect(screen.queryByText(/Limit Reached/)).not.toBeInTheDocument();
  });

  it("does not show count when showCount is false", () => {
    render(
      <QuotaGate
        current={3}
        limit={5}
        resourceName="Saved Queries"
        showCount={false}
      >
        <button>Save Query</button>
      </QuotaGate>,
    );

    expect(screen.queryByText("Saved Queries (3/5)")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save Query" }),
    ).toBeInTheDocument();
  });
});

describe("QuotaCountBadge", () => {
  it("shows count for free users", () => {
    render(
      <QuotaCountBadge current={3} limit={5} resourceName="Saved Queries" />,
    );

    expect(screen.getByText("3/5")).toBeInTheDocument();
  });

  it("returns null for Pro users", () => {
    const { container } = render(
      <QuotaCountBadge
        current={100}
        limit={null}
        resourceName="Saved Queries"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows at-quota styling when at limit", () => {
    render(
      <QuotaCountBadge current={5} limit={5} resourceName="Saved Queries" />,
    );

    const badge = screen.getByText("5/5");
    expect(badge).toHaveClass("text-destructive");
  });

  it("shows near-quota styling when almost at limit", () => {
    render(
      <QuotaCountBadge current={4} limit={5} resourceName="Saved Queries" />,
    );

    const badge = screen.getByText("4/5");
    expect(badge).toHaveClass("text-warning");
  });

  it("shows normal styling when well under quota", () => {
    render(
      <QuotaCountBadge current={1} limit={5} resourceName="Saved Queries" />,
    );

    const badge = screen.getByText("1/5");
    expect(badge).toHaveClass("text-muted-foreground");
  });
});
