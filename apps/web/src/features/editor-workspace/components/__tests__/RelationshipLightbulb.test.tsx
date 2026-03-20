import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRelationshipStore } from "@/features/editor-workspace/store/relationship-store";
import type { RelationshipGraph } from "@/features/editor-workspace/utils/relationship-graph";

import type { JoinRelationship } from "../RelationshipLightbulb";
import { RelationshipLightbulb } from "../RelationshipLightbulb";

vi.mock("@solar-icons/react", () => ({
  Lightbulb: () => <span data-testid="lightbulb-icon" />,
}));

const emptyGraph: RelationshipGraph = { edges: [], exclusions: [] };

const confirmedGraph: RelationshipGraph = {
  edges: [
    {
      sourceDE: "Orders",
      sourceColumn: "CustomerId",
      targetDE: "Customers",
      targetColumn: "Id",
      confidence: "confirmed",
      source: "user",
    },
  ],
  exclusions: [],
};

const ordersCustomersRel: JoinRelationship = {
  sourceDE: "Orders",
  sourceColumn: "CustomerId",
  targetDE: "Customers",
  targetColumn: "Id",
};

const ordersProductsRel: JoinRelationship = {
  sourceDE: "Orders",
  sourceColumn: "ProductId",
  targetDE: "Products",
  targetColumn: "Id",
};

function resetStore() {
  useRelationshipStore.setState({
    sessionDismissals: new Set(),
    configDEConfirmed: false,
    showFirstSaveDialog: false,
    pendingSave: null,
  });
}

describe("RelationshipLightbulb", () => {
  const onSave = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    resetStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    resetStore();
  });

  it("renders nothing when queryRelationships is empty", () => {
    const { container } = render(
      <RelationshipLightbulb
        queryRelationships={[]}
        graph={emptyGraph}
        onSave={onSave}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when all relationships are already confirmed in the graph", () => {
    const { container } = render(
      <RelationshipLightbulb
        queryRelationships={[ordersCustomersRel]}
        graph={confirmedGraph}
        onSave={onSave}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders one row per unsaved relationship with correct text", () => {
    render(
      <RelationshipLightbulb
        queryRelationships={[ordersCustomersRel, ordersProductsRel]}
        graph={confirmedGraph}
        onSave={onSave}
      />,
    );

    const rows = screen.getAllByTestId("lightbulb-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Orders.ProductId");
    expect(rows[0]).toHaveTextContent("Products.Id");
  });

  it("persists until user explicitly dismisses", async () => {
    render(
      <RelationshipLightbulb
        queryRelationships={[ordersProductsRel]}
        graph={emptyGraph}
        onSave={onSave}
      />,
    );

    expect(screen.getByTestId("lightbulb-row")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByTestId("lightbulb-row")).toBeInTheDocument();
  });

  it("clicking dismiss removes the row after animation", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <RelationshipLightbulb
        queryRelationships={[ordersProductsRel]}
        graph={emptyGraph}
        onSave={onSave}
      />,
    );

    expect(screen.getAllByTestId("lightbulb-row")).toHaveLength(1);

    await user.click(screen.getByTestId("lightbulb-dismiss"));

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.queryByTestId("lightbulb-row")).not.toBeInTheDocument();
  });

  it("clicking Save when configDEConfirmed is false opens first-save dialog", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <RelationshipLightbulb
        queryRelationships={[ordersProductsRel]}
        graph={emptyGraph}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByTestId("lightbulb-save"));

    const state = useRelationshipStore.getState();
    expect(state.showFirstSaveDialog).toBe(true);
    expect(state.pendingSave).toEqual({
      sourceDE: "Orders",
      sourceColumn: "ProductId",
      targetDE: "Products",
      targetColumn: "Id",
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("clicking Save when configDEConfirmed is true calls onSave directly", async () => {
    useRelationshipStore.setState({ configDEConfirmed: true });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <RelationshipLightbulb
        queryRelationships={[ordersProductsRel]}
        graph={emptyGraph}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByTestId("lightbulb-save"));

    expect(onSave).toHaveBeenCalledWith({
      sourceDE: "Orders",
      sourceColumn: "ProductId",
      targetDE: "Products",
      targetColumn: "Id",
    });
  });
});
