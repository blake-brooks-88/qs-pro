import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LinkConflictDialog } from "../LinkConflictDialog";

// DiffEditor requires a browser canvas environment — mock it
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
    localSql: "SELECT 1 FROM Local",
    remoteSql: "SELECT 2 FROM Remote",
    qaName: "My QA",
    onResolve: vi.fn(),
    isPending: false,
  };
}

describe("LinkConflictDialog", () => {
  it("renders dialog title", () => {
    render(<LinkConflictDialog {...createDefaultProps()} />);

    expect(screen.getByText("SQL Conflict Detected")).toBeInTheDocument();
  });

  it("shows QA name in description", () => {
    render(<LinkConflictDialog {...createDefaultProps()} />);

    expect(screen.getByText(/My QA/)).toBeInTheDocument();
  });

  it("passes SQL to DiffEditor", () => {
    render(<LinkConflictDialog {...createDefaultProps()} />);

    expect(screen.getByTestId("diff-original")).toHaveTextContent(
      "SELECT 2 FROM Remote",
    );
    expect(screen.getByTestId("diff-modified")).toHaveTextContent(
      "SELECT 1 FROM Local",
    );
  });

  it("calls onResolve with keep-remote when AS button clicked", async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    render(<LinkConflictDialog {...props} />);

    await user.click(screen.getByRole("button", { name: /keep as version/i }));

    expect(props.onResolve).toHaveBeenCalledWith("keep-remote");
  });

  it("calls onResolve with keep-local when Q++ button clicked", async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    render(<LinkConflictDialog {...props} />);

    await user.click(
      screen.getByRole("button", { name: /keep q\+\+ version/i }),
    );

    expect(props.onResolve).toHaveBeenCalledWith("keep-local");
  });

  it("calls onClose when Cancel clicked", async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    render(<LinkConflictDialog {...props} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(props.onClose).toHaveBeenCalled();
  });

  it("disables resolution and cancel buttons when isPending", () => {
    render(<LinkConflictDialog {...createDefaultProps()} isPending />);

    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();

    // Both resolution buttons show "Linking..." and are disabled
    const linkingButtons = screen.getAllByText("Linking...");
    expect(linkingButtons.length).toBe(2);
    for (const el of linkingButtons) {
      const btn = el.closest("button");
      expect(btn).toBeDisabled();
    }
  });

  it("shows 'Linking...' text when isPending", () => {
    render(<LinkConflictDialog {...createDefaultProps()} isPending />);

    const linkingButtons = screen.getAllByText("Linking...");
    expect(linkingButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("does not render when isOpen is false", () => {
    render(<LinkConflictDialog {...createDefaultProps()} isOpen={false} />);

    expect(screen.queryByText("SQL Conflict Detected")).not.toBeInTheDocument();
  });
});
