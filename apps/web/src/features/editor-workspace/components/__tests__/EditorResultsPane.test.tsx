import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PointerEvent as ReactPointerEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionResult } from "@/features/editor-workspace/types";

import { EditorResultsPane } from "../EditorResultsPane";

let mockSmartRelEnabled = false;
vi.mock("@/hooks/use-feature", () => ({
  useFeature: () => ({ enabled: mockSmartRelEnabled, isLoading: false }),
}));

vi.mock("../RelationshipLightbulb", () => ({
  RelationshipLightbulb: () => (
    <div data-testid="relationship-lightbulb">Lightbulb</div>
  ),
}));

vi.mock("../FirstSaveConfirmation", () => ({
  FirstSaveConfirmation: () => (
    <div data-testid="first-save-confirmation">FirstSave</div>
  ),
}));

vi.mock("../ResultsPane", () => ({
  ResultsPane: ({
    result,
    onCancel,
  }: {
    result: ExecutionResult;
    onCancel?: () => void;
  }) => (
    <div data-testid="results-pane" data-status={result.status}>
      {result.status === "running" && (
        <button onClick={onCancel} data-testid="cancel-button">
          Cancel
        </button>
      )}
    </div>
  ),
}));

function createExecutionResult(
  overrides: Partial<ExecutionResult> = {},
): ExecutionResult {
  return {
    status: "idle",
    runtime: "0ms",
    totalRows: 0,
    currentPage: 1,
    pageSize: 50,
    columns: [],
    rows: [],
    ...overrides,
  };
}

describe("EditorResultsPane", () => {
  const defaultProps = {
    shouldShowResultsPane: false,
    resultsHeight: 300,
    isResizingResults: false,
    onResizeStart: vi.fn<(event: ReactPointerEvent<HTMLDivElement>) => void>(),
    onToggle: vi.fn(),
    result: createExecutionResult(),
    onPageChange: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSmartRelEnabled = false;
  });

  it("renders expand button when results pane is collapsed", () => {
    render(<EditorResultsPane {...defaultProps} />);

    expect(screen.getByText("Run a query to see results")).toBeInTheDocument();
    expect(screen.queryByTestId("results-pane")).not.toBeInTheDocument();
  });

  it("calls onToggle when expand button is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(<EditorResultsPane {...defaultProps} onToggle={onToggle} />);

    await user.click(screen.getByText("Run a query to see results"));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders ResultsPane when shouldShowResultsPane is true", () => {
    render(
      <EditorResultsPane
        {...defaultProps}
        shouldShowResultsPane={true}
        result={createExecutionResult({ status: "success" })}
      />,
    );

    expect(screen.getByTestId("results-pane")).toBeInTheDocument();
    expect(
      screen.queryByText("Run a query to see results"),
    ).not.toBeInTheDocument();
  });

  it("applies custom height when results pane is open", () => {
    const { container } = render(
      <EditorResultsPane
        {...defaultProps}
        shouldShowResultsPane={true}
        resultsHeight={400}
      />,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.height).toBe("400px");
  });

  it("applies collapsed height when results pane is hidden", () => {
    const { container } = render(<EditorResultsPane {...defaultProps} />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.height).toBe("32px");
  });

  it("renders resize handle when results pane is open", () => {
    const { container } = render(
      <EditorResultsPane {...defaultProps} shouldShowResultsPane={true} />,
    );

    const resizeHandle = container.querySelector(".cursor-row-resize");
    expect(resizeHandle).toBeInTheDocument();
  });

  it("does not render resize handle when results pane is collapsed", () => {
    const { container } = render(<EditorResultsPane {...defaultProps} />);

    const resizeHandle = container.querySelector(".cursor-row-resize");
    expect(resizeHandle).not.toBeInTheDocument();
  });

  describe("smart relationships", () => {
    it("renders RelationshipLightbulb when conditions are met", () => {
      mockSmartRelEnabled = true;

      render(
        <EditorResultsPane
          {...defaultProps}
          shouldShowResultsPane={true}
          result={createExecutionResult({ status: "success" })}
          executedSql="SELECT * FROM A a JOIN B b ON a.id = b.id"
          relationshipGraph={{
            edges: [
              {
                sourceDE: "A",
                sourceColumn: "id",
                targetDE: "B",
                targetColumn: "id",
                confidence: "confirmed",
                source: "user",
              },
            ],
            exclusions: [],
          }}
          onSaveRelationship={vi.fn()}
        />,
      );

      expect(screen.getByTestId("relationship-lightbulb")).toBeInTheDocument();
    });

    it("does not render lightbulb when feature is disabled", () => {
      mockSmartRelEnabled = false;

      render(
        <EditorResultsPane
          {...defaultProps}
          shouldShowResultsPane={true}
          result={createExecutionResult({ status: "success" })}
          executedSql="SELECT * FROM A a JOIN B b ON a.id = b.id"
          relationshipGraph={{
            edges: [
              {
                sourceDE: "A",
                sourceColumn: "id",
                targetDE: "B",
                targetColumn: "id",
                confidence: "confirmed",
                source: "user",
              },
            ],
            exclusions: [],
          }}
          onSaveRelationship={vi.fn()}
        />,
      );

      expect(
        screen.queryByTestId("relationship-lightbulb"),
      ).not.toBeInTheDocument();
    });

    it("renders FirstSaveConfirmation when onConfirmFirstSave is provided", () => {
      render(
        <EditorResultsPane
          {...defaultProps}
          shouldShowResultsPane={true}
          result={createExecutionResult({ status: "success" })}
          onConfirmFirstSave={vi.fn()}
        />,
      );

      expect(screen.getByTestId("first-save-confirmation")).toBeInTheDocument();
    });

    it("does not render FirstSaveConfirmation when onConfirmFirstSave is absent", () => {
      render(
        <EditorResultsPane
          {...defaultProps}
          shouldShowResultsPane={true}
          result={createExecutionResult({ status: "success" })}
        />,
      );

      expect(
        screen.queryByTestId("first-save-confirmation"),
      ).not.toBeInTheDocument();
    });
  });
});
