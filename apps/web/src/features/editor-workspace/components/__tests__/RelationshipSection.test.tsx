import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRelationshipStore } from "@/features/editor-workspace/store/relationship-store";
import type {
  RelationshipEdge,
  RelationshipGraph,
} from "@/features/editor-workspace/utils/relationship-graph/types";

import { RelationshipSection } from "../RelationshipSection";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSaveMutate = vi.fn();
const mockDismissMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock("@/features/editor-workspace/hooks/use-relationship-config", () => ({
  useSaveRelationship: () => ({ mutate: mockSaveMutate, isPending: false }),
  useDismissRelationship: () => ({
    mutate: mockDismissMutate,
    isPending: false,
  }),
  useDeleteRelationship: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
}));

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const confirmedEdge: RelationshipEdge = {
  sourceDE: "Subscribers",
  sourceColumn: "SubscriberKey",
  targetDE: "Orders",
  targetColumn: "SubscriberKey",
  confidence: "confirmed",
  source: "user",
  ruleId: "rule-1",
};

const highConfidenceEdge: RelationshipEdge = {
  sourceDE: "Subscribers",
  sourceColumn: "EmailAddress",
  targetDE: "Campaigns",
  targetColumn: "Email",
  confidence: "high",
  source: "inferred",
};

const mediumConfidenceEdge: RelationshipEdge = {
  sourceDE: "Products",
  sourceColumn: "ProductID",
  targetDE: "Subscribers",
  targetColumn: "ProductRef",
  confidence: "medium",
  source: "inferred",
};

function buildGraph(edges: RelationshipEdge[]): RelationshipGraph {
  return { edges, exclusions: [] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return TestWrapper;
}

function renderSection(
  deName: string,
  graph: RelationshipGraph,
  onNavigateToDE = vi.fn(),
) {
  return render(
    <RelationshipSection
      deName={deName}
      graph={graph}
      onNavigateToDE={onNavigateToDE}
    />,
    { wrapper: createWrapper() },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RelationshipSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRelationshipStore.setState({ configDEConfirmed: true });
  });

  it("renders nothing when graph has no edges for the given DE", () => {
    const { container } = renderSection("UnknownDE", buildGraph([]));
    expect(container.firstChild).toBeNull();
  });

  it("shows confirmed relationships for edges where sourceDE matches", () => {
    renderSection("Subscribers", buildGraph([confirmedEdge]));
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("via SubscriberKey")).toBeInTheDocument();
  });

  it("shows confirmed relationships bidirectionally (targetDE matches)", () => {
    renderSection("Orders", buildGraph([confirmedEdge]));
    expect(screen.getByText("Subscribers")).toBeInTheDocument();
    expect(screen.getByText("via SubscriberKey")).toBeInTheDocument();
  });

  it("displays different column names with arrow notation", () => {
    renderSection("Subscribers", buildGraph([highConfidenceEdge]));
    fireEvent.click(screen.getByText(/1 suggested relationship/));
    expect(
      screen.getByText("via EmailAddress \u2192 Email"),
    ).toBeInTheDocument();
  });

  it("suggested section is collapsed by default with correct count", () => {
    renderSection(
      "Subscribers",
      buildGraph([highConfidenceEdge, mediumConfidenceEdge]),
    );
    expect(screen.getByText("2 suggested relationships")).toBeInTheDocument();
    expect(screen.queryByText("Campaigns")).not.toBeInTheDocument();
  });

  it("expands suggested section on click to show relationships", async () => {
    const user = userEvent.setup();
    renderSection(
      "Subscribers",
      buildGraph([highConfidenceEdge, mediumConfidenceEdge]),
    );
    await user.click(screen.getByText("2 suggested relationships"));
    expect(screen.getByText("Campaigns")).toBeInTheDocument();
    expect(screen.getByText("Products")).toBeInTheDocument();
  });

  it("clicking dismiss on a suggestion calls dismissMutation.mutate()", async () => {
    const user = userEvent.setup();
    renderSection("Subscribers", buildGraph([highConfidenceEdge]));
    await user.click(screen.getByText("1 suggested relationship"));

    const dismissBtn = screen.getByLabelText(
      "Dismiss relationship with Campaigns",
    );
    await user.click(dismissBtn);

    expect(mockDismissMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDE: "Subscribers",
        sourceColumn: "EmailAddress",
        targetDE: "Campaigns",
        targetColumn: "Email",
      }),
    );
  });

  it("clicking confirm on a suggestion calls saveMutation.mutate()", async () => {
    const user = userEvent.setup();
    renderSection("Subscribers", buildGraph([highConfidenceEdge]));
    await user.click(screen.getByText("1 suggested relationship"));

    const confirmBtn = screen.getByLabelText(
      "Confirm relationship with Campaigns",
    );
    await user.click(confirmBtn);

    expect(mockSaveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleType: "explicit_link",
        sourceDE: "Subscribers",
        sourceColumn: "EmailAddress",
        targetDE: "Campaigns",
        targetColumn: "Email",
      }),
    );
  });

  it("clicking remove on a confirmed relationship shows inline confirmation", async () => {
    const user = userEvent.setup();
    renderSection("Subscribers", buildGraph([confirmedEdge]));

    const removeBtn = screen.getByLabelText("Remove relationship with Orders");
    await user.click(removeBtn);

    expect(screen.getByText("Remove for team?")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("confirming removal calls deleteMutation.mutate() with ruleId", async () => {
    const user = userEvent.setup();
    renderSection("Subscribers", buildGraph([confirmedEdge]));

    await user.click(screen.getByLabelText("Remove relationship with Orders"));
    await user.click(screen.getByText("Remove"));

    expect(mockDeleteMutate).toHaveBeenCalledWith("rule-1");
  });

  it("cancelling removal restores normal row", async () => {
    const user = userEvent.setup();
    renderSection("Subscribers", buildGraph([confirmedEdge]));

    await user.click(screen.getByLabelText("Remove relationship with Orders"));
    await user.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Remove for team?")).not.toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
  });

  it("clicking linked DE name calls onNavigateToDE", async () => {
    const user = userEvent.setup();
    const onNavigateToDE = vi.fn();
    renderSection("Subscribers", buildGraph([confirmedEdge]), onNavigateToDE);

    await user.click(screen.getByText("Orders"));
    expect(onNavigateToDE).toHaveBeenCalledWith("Orders");
  });
});
