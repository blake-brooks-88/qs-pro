import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMockEditor,
  createMockModel,
  createMockMonaco,
  type MockEditor,
  type MockModel,
  type MockMonaco,
} from "@/test/monaco-mock-factory";

import { applySqlMarkers } from "./apply-sql-markers";

vi.mock("@/features/editor-workspace/utils/sql-diagnostics", () => ({
  toMonacoMarkers: vi.fn(() => []),
  isMarkerDiagnostic: vi.fn(),
  getPositionFromIndex: vi.fn(),
  formatDiagnosticMessage: vi.fn(),
}));

import { toMonacoMarkers } from "@/features/editor-workspace/utils/sql-diagnostics";

type MonacoEditor = Parameters<typeof applySqlMarkers>[0]["editor"];
type Monaco = Parameters<typeof applySqlMarkers>[0]["monaco"];

const mockedToMonacoMarkers = vi.mocked(toMonacoMarkers);

describe("applySqlMarkers", () => {
  let mockMonaco: MockMonaco;
  let mockModel: MockModel;
  let mockEditor: MockEditor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMonaco = createMockMonaco();
    mockModel = createMockModel("SELECT * FROM [Customers]");
    const { editor } = createMockEditor(mockModel);
    mockEditor = editor;
  });

  it("does not call setModelMarkers when editor has no model", () => {
    const { editor } = createMockEditor(null);

    applySqlMarkers({
      editor: editor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      diagnostics: [
        { message: "err", severity: "error", startIndex: 0, endIndex: 5 },
      ],
    });

    expect(mockMonaco.editor.setModelMarkers).not.toHaveBeenCalled();
  });

  it("converts diagnostics and sets markers on the model", () => {
    const fakeMarkers = [
      {
        severity: 8,
        message: "Line 1: error",
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 6,
      },
    ];
    mockedToMonacoMarkers.mockReturnValue(fakeMarkers);

    const diagnostics = [
      {
        message: "error",
        severity: "error" as const,
        startIndex: 0,
        endIndex: 5,
      },
    ];

    applySqlMarkers({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      diagnostics,
    });

    expect(mockedToMonacoMarkers).toHaveBeenCalledWith(
      diagnostics,
      "SELECT * FROM [Customers]",
      mockMonaco,
    );
    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledWith(
      mockEditor.getModel(),
      "sql-lint",
      fakeMarkers,
    );
  });

  it("uses default owner 'sql-lint' when no owner is specified", () => {
    mockedToMonacoMarkers.mockReturnValue([]);

    applySqlMarkers({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      diagnostics: [],
    });

    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledWith(
      mockEditor.getModel(),
      "sql-lint",
      [],
    );
  });

  it("uses custom owner parameter when provided", () => {
    mockedToMonacoMarkers.mockReturnValue([]);

    applySqlMarkers({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      diagnostics: [],
      owner: "custom-owner",
    });

    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledWith(
      mockEditor.getModel(),
      "custom-owner",
      [],
    );
  });

  it("clears markers when diagnostics array is empty", () => {
    mockedToMonacoMarkers.mockReturnValue([]);

    applySqlMarkers({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      diagnostics: [],
    });

    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledWith(
      mockEditor.getModel(),
      "sql-lint",
      [],
    );
  });
});
