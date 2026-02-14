import "@/test/mocks/monaco-editor-react";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VersionDiffViewer } from "../VersionDiffViewer";

vi.mock("@/features/editor-workspace/utils/monaco-options", () => ({
  getEditorOptions: () => ({
    minimap: { enabled: false },
    lineNumbers: "on",
  }),
  MONACO_THEME_NAME: "qs-pro-sql",
}));

describe("VersionDiffViewer", () => {
  const baseProps = {
    savedQueryId: "sq-1",
    currentSql: "SELECT Id FROM Contact",
    previousSql: "SELECT Name FROM Contact",
    showChanges: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Editor when showChanges is false", () => {
    render(<VersionDiffViewer {...baseProps} showChanges={false} />);

    expect(screen.getByTestId("monaco-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("diff-editor")).not.toBeInTheDocument();
  });

  it("renders Editor when previousSql is null", () => {
    render(
      <VersionDiffViewer
        {...baseProps}
        previousSql={null}
        showChanges={true}
      />,
    );

    expect(screen.getByTestId("monaco-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("diff-editor")).not.toBeInTheDocument();
  });

  it("renders DiffEditor when showChanges is true and previousSql is provided", () => {
    render(<VersionDiffViewer {...baseProps} />);

    expect(screen.getByTestId("diff-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("monaco-editor")).not.toBeInTheDocument();
  });

  it("renders Editor with currentSql value when in read-only mode", () => {
    render(<VersionDiffViewer {...baseProps} showChanges={false} />);

    const textarea = screen.getByTestId("monaco-textarea");
    expect(textarea).toHaveValue("SELECT Id FROM Contact");
  });

  it("falls back to Editor when both showChanges=false and previousSql=null", () => {
    render(
      <VersionDiffViewer
        {...baseProps}
        showChanges={false}
        previousSql={null}
      />,
    );

    expect(screen.getByTestId("monaco-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("diff-editor")).not.toBeInTheDocument();
  });
});
