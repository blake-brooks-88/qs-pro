import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DriftDetectionDialog } from "../DriftDetectionDialog";

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
}));

function createDefaultProps() {
  return {
    isOpen: true,
    onClose: vi.fn(),
    localSql: "SELECT Local FROM [MyDE]",
    remoteSql: "SELECT Remote FROM [MyDE]",
    qaName: "My QA",
    onKeepMine: vi.fn(),
    onAcceptTheirs: vi.fn(),
    isPending: false,
  };
}

describe("DriftDetectionDialog", () => {
  it('renders dialog title "SQL Drift Detected" when open', () => {
    render(<DriftDetectionDialog {...createDefaultProps()} />);

    expect(screen.getByText("SQL Drift Detected")).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    render(<DriftDetectionDialog {...createDefaultProps()} isOpen={false} />);

    expect(screen.queryByText("SQL Drift Detected")).not.toBeInTheDocument();
  });

  it("renders Monaco DiffEditor with remote SQL (original) and local SQL (modified)", () => {
    render(<DriftDetectionDialog {...createDefaultProps()} />);

    expect(screen.getByTestId("diff-original")).toHaveTextContent(
      "SELECT Remote FROM [MyDE]",
    );
    expect(screen.getByTestId("diff-modified")).toHaveTextContent(
      "SELECT Local FROM [MyDE]",
    );
  });

  it('calls onKeepMine when "Keep Mine" button is clicked', async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    render(<DriftDetectionDialog {...props} />);

    await user.click(screen.getByRole("button", { name: /keep mine/i }));

    expect(props.onKeepMine).toHaveBeenCalled();
  });

  it('calls onAcceptTheirs when "Accept Theirs" button is clicked', async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    render(<DriftDetectionDialog {...props} />);

    await user.click(screen.getByRole("button", { name: /accept theirs/i }));

    expect(props.onAcceptTheirs).toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    render(<DriftDetectionDialog {...props} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(props.onClose).toHaveBeenCalled();
  });

  it("disables buttons when isPending is true", () => {
    render(<DriftDetectionDialog {...createDefaultProps()} isPending />);

    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /updating/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /publishing/i })).toBeDisabled();
  });

  it("shows QA name in the description text", () => {
    render(<DriftDetectionDialog {...createDefaultProps()} />);

    expect(screen.getByText(/My QA/)).toBeInTheDocument();
  });

  it("shows 'Updating...' and 'Publishing...' text when isPending", () => {
    render(<DriftDetectionDialog {...createDefaultProps()} isPending />);

    expect(screen.getByText("Updating...")).toBeInTheDocument();
    expect(screen.getByText("Publishing...")).toBeInTheDocument();
  });
});
