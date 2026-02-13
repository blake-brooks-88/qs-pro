import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PublishConfirmationDialog } from "../PublishConfirmationDialog";

vi.mock("@monaco-editor/react", () => ({
  DiffEditor: ({
    original,
    modified,
  }: {
    original: string;
    modified: string;
  }) => (
    <div data-testid="mock-diff-editor">
      <span data-testid="diff-original">{original}</span>
      <span data-testid="diff-modified">{modified}</span>
    </div>
  ),
  default: ({ value }: { value: string }) => (
    <div data-testid="mock-editor">
      <span data-testid="editor-value">{value}</span>
    </div>
  ),
}));

function createDefaultProps() {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isPending: false,
    qaName: "My Query Activity",
    currentAsSql: "SELECT OldCol FROM [OldDE]",
    versionSql: "SELECT NewCol FROM [NewDE]",
    automations: [] as {
      id: string;
      name: string;
      status: string;
      isHighRisk: boolean;
    }[],
    isLoadingBlastRadius: false,
  };
}

describe("PublishConfirmationDialog", () => {
  it('renders dialog title "Publish to Automation Studio" when open', () => {
    render(<PublishConfirmationDialog {...createDefaultProps()} />);

    expect(
      screen.getByText("Publish to Automation Studio"),
    ).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    render(
      <PublishConfirmationDialog {...createDefaultProps()} isOpen={false} />,
    );

    expect(
      screen.queryByText("Publish to Automation Studio"),
    ).not.toBeInTheDocument();
  });

  it("renders Monaco DiffEditor with correct original (AS SQL) and modified (version SQL)", () => {
    render(<PublishConfirmationDialog {...createDefaultProps()} />);

    expect(screen.getByTestId("diff-original")).toHaveTextContent(
      "SELECT OldCol FROM [OldDE]",
    );
    expect(screen.getByTestId("diff-modified")).toHaveTextContent(
      "SELECT NewCol FROM [NewDE]",
    );
  });

  it('shows "No automations use this Query Activity" when automations list is empty', () => {
    render(<PublishConfirmationDialog {...createDefaultProps()} />);

    expect(
      screen.getByText("No automations use this Query Activity."),
    ).toBeInTheDocument();
  });

  it("shows automation list with status when automations are provided", () => {
    const props = createDefaultProps();
    props.automations = [
      {
        id: "auto-1",
        name: "Daily Send",
        status: "Scheduled",
        isHighRisk: true,
      },
      {
        id: "auto-2",
        name: "Weekly Report",
        status: "Stopped",
        isHighRisk: false,
      },
    ];

    render(<PublishConfirmationDialog {...props} />);

    expect(screen.getByText("Daily Send")).toBeInTheDocument();
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText("Weekly Report")).toBeInTheDocument();
    expect(screen.getByText("Stopped")).toBeInTheDocument();
  });

  it("marks high-risk automations with amber indicator", () => {
    const props = createDefaultProps();
    props.automations = [
      {
        id: "auto-1",
        name: "Live Automation",
        status: "Running",
        isHighRisk: true,
      },
      {
        id: "auto-2",
        name: "Idle Automation",
        status: "Stopped",
        isHighRisk: false,
      },
    ];

    render(<PublishConfirmationDialog {...props} />);

    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(2);

    const highRiskDot = listItems[0]?.querySelector(".bg-amber-500");
    expect(highRiskDot).not.toBeNull();

    const normalDot = listItems[1]?.querySelector(".bg-muted-foreground");
    expect(normalDot).not.toBeNull();
  });

  it("shows AS editability note text", () => {
    render(<PublishConfirmationDialog {...createDefaultProps()} />);

    expect(
      screen.getByText(/edited directly in\s*Automation Studio/),
    ).toBeInTheDocument();
  });

  it("shows loading indicator when isLoadingBlastRadius is true", () => {
    render(
      <PublishConfirmationDialog
        {...createDefaultProps()}
        isLoadingBlastRadius
      />,
    );

    expect(screen.getByText("Loading automations...")).toBeInTheDocument();
  });

  it('calls onConfirm when "Publish" button is clicked', async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    render(<PublishConfirmationDialog {...props} />);

    await user.click(screen.getByRole("button", { name: /publish/i }));

    expect(props.onConfirm).toHaveBeenCalled();
  });

  it('calls onClose when "Cancel" button is clicked', async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    render(<PublishConfirmationDialog {...props} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(props.onClose).toHaveBeenCalled();
  });

  it("disables buttons when isPending is true", () => {
    render(<PublishConfirmationDialog {...createDefaultProps()} isPending />);

    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /publishing/i })).toBeDisabled();
  });

  it("shows 'Publishing...' text when isPending", () => {
    render(<PublishConfirmationDialog {...createDefaultProps()} isPending />);

    expect(screen.getByText("Publishing...")).toBeInTheDocument();
  });

  it("when currentAsSql is null (first publish), shows version SQL in a non-diff view", () => {
    const props = {
      ...createDefaultProps(),
      currentAsSql: null as string | null,
    };

    render(<PublishConfirmationDialog {...props} />);

    expect(screen.getByText("SQL to Publish")).toBeInTheDocument();
    expect(screen.getByTestId("editor-value")).toHaveTextContent(
      "SELECT NewCol FROM [NewDE]",
    );
    expect(screen.queryByTestId("mock-diff-editor")).not.toBeInTheDocument();
  });

  it("shows QA name in description text", () => {
    render(<PublishConfirmationDialog {...createDefaultProps()} />);

    expect(screen.getByText(/My Query Activity/)).toBeInTheDocument();
  });

  describe("blast radius error state", () => {
    it("shows error message when blastRadiusError is true", () => {
      render(
        <PublishConfirmationDialog
          {...createDefaultProps()}
          blastRadiusError
        />,
      );

      expect(
        screen.getByText(
          "Unable to load automation data. Proceed with caution.",
        ),
      ).toBeInTheDocument();
    });

    it("does NOT show 'No automations' when blastRadiusError is true", () => {
      render(
        <PublishConfirmationDialog
          {...createDefaultProps()}
          blastRadiusError
        />,
      );

      expect(
        screen.queryByText("No automations use this Query Activity."),
      ).not.toBeInTheDocument();
    });

    it("publish button remains enabled during error state", () => {
      render(
        <PublishConfirmationDialog
          {...createDefaultProps()}
          blastRadiusError
        />,
      );

      expect(
        screen.getByRole("button", { name: /publish/i }),
      ).not.toBeDisabled();
    });
  });
});
