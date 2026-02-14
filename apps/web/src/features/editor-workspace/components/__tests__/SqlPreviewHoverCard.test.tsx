import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@radix-ui/react-hover-card", () => ({
  Root: ({ children }: { children: ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: ReactNode }) => <>{children}</>,
  Arrow: () => null,
}));

import { SqlPreviewHoverCard } from "../SqlPreviewHoverCard";

// Mock the useRunSqlText hook (external boundary: TanStack Query + axios)
const mockRefetch = vi.fn();
let mockHookReturn: {
  data: string | undefined;
  refetch: typeof mockRefetch;
  isFetching: boolean;
};

vi.mock("@/features/editor-workspace/hooks/use-execution-history", () => ({
  useRunSqlText: () => mockHookReturn,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("SqlPreviewHoverCard", () => {
  const defaultProps = {
    runId: "run-123",
    hasSql: true,
    onOpenInNewTab: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockHookReturn = {
      data: undefined,
      refetch: mockRefetch,
      isFetching: false,
    };
  });

  it("renders children directly without hover trigger when hasSql is false", () => {
    // Arrange & Act
    render(
      <SqlPreviewHoverCard {...defaultProps} hasSql={false}>
        <span data-testid="child">SELECT 1</span>
      </SqlPreviewHoverCard>,
    );

    // Assert - child is rendered
    expect(screen.getByTestId("child")).toBeInTheDocument();
    // Assert - no cursor-pointer wrapper (no hover card trigger)
    expect(document.querySelector(".cursor-pointer")).toBeNull();
  });

  it("wraps children in hover trigger when hasSql is true", () => {
    // Arrange & Act
    render(
      <SqlPreviewHoverCard {...defaultProps} hasSql={true}>
        <span data-testid="child">SELECT 1</span>
      </SqlPreviewHoverCard>,
    );

    // Assert - child is rendered inside a cursor-pointer wrapper
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(document.querySelector(".cursor-pointer")).not.toBeNull();
  });

  it("calls onOpenInNewTab with fetched SQL on double-click", async () => {
    // Arrange
    const user = userEvent.setup();
    const onOpenInNewTab = vi.fn();
    const fetchedSql = "SELECT SubscriberKey FROM _Subscribers";
    mockRefetch.mockResolvedValue({ data: fetchedSql });

    render(
      <SqlPreviewHoverCard {...defaultProps} onOpenInNewTab={onOpenInNewTab}>
        <span data-testid="child">preview...</span>
      </SqlPreviewHoverCard>,
    );

    // Act - double-click the trigger
    const trigger = document.querySelector(".cursor-pointer") as HTMLElement;
    await user.dblClick(trigger);

    // Assert
    expect(mockRefetch).toHaveBeenCalled();
    expect(onOpenInNewTab).toHaveBeenCalledWith(fetchedSql);
  });

  it("uses cached SQL on double-click without refetching", async () => {
    // Arrange
    const user = userEvent.setup();
    const onOpenInNewTab = vi.fn();
    const cachedSql = "SELECT 1 FROM Contacts";
    mockHookReturn = {
      data: cachedSql,
      refetch: mockRefetch,
      isFetching: false,
    };

    render(
      <SqlPreviewHoverCard {...defaultProps} onOpenInNewTab={onOpenInNewTab}>
        <span data-testid="child">preview...</span>
      </SqlPreviewHoverCard>,
    );

    // Act
    const trigger = document.querySelector(".cursor-pointer") as HTMLElement;
    await user.dblClick(trigger);

    // Assert - should use cached data, not refetch
    expect(mockRefetch).not.toHaveBeenCalled();
    expect(onOpenInNewTab).toHaveBeenCalledWith(cachedSql);
  });

  it("shows error toast when fetch returns no data on double-click", async () => {
    // Arrange
    const user = userEvent.setup();
    const onOpenInNewTab = vi.fn();
    mockRefetch.mockResolvedValue({ data: undefined });

    render(
      <SqlPreviewHoverCard {...defaultProps} onOpenInNewTab={onOpenInNewTab}>
        <span data-testid="child">preview...</span>
      </SqlPreviewHoverCard>,
    );

    // Act
    const trigger = document.querySelector(".cursor-pointer") as HTMLElement;
    await user.dblClick(trigger);

    // Assert
    expect(mockRefetch).toHaveBeenCalled();
    expect(onOpenInNewTab).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Unable to retrieve SQL");
  });

  it("does not fetch or open tab on double-click when hasSql is false", async () => {
    // Arrange
    const user = userEvent.setup();
    const onOpenInNewTab = vi.fn();

    render(
      <SqlPreviewHoverCard
        {...defaultProps}
        hasSql={false}
        onOpenInNewTab={onOpenInNewTab}
      >
        <span data-testid="child">--</span>
      </SqlPreviewHoverCard>,
    );

    // Act - double-click the child directly (no trigger wrapper)
    await user.dblClick(screen.getByTestId("child"));

    // Assert
    expect(mockRefetch).not.toHaveBeenCalled();
    expect(onOpenInNewTab).not.toHaveBeenCalled();
  });
});
