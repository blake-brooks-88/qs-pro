import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMockEditor,
  createMockModel,
  createMockMonaco,
  type MockEditor,
  type MockModel,
  type MockMonaco,
} from "@/test/monaco-mock-factory";

import { applySqlDecorations } from "./apply-sql-decorations";

vi.mock("@/features/editor-workspace/utils/sql-context", () => ({
  extractTableReferences: vi.fn(() => []),
  extractSelectFieldRanges: vi.fn(() => []),
}));

import {
  extractSelectFieldRanges,
  extractTableReferences,
} from "@/features/editor-workspace/utils/sql-context";

type MonacoEditor = Parameters<typeof applySqlDecorations>[0]["editor"];
type Monaco = Parameters<typeof applySqlDecorations>[0]["monaco"];

const mockedExtractTableReferences = vi.mocked(extractTableReferences);
const mockedExtractSelectFieldRanges = vi.mocked(extractSelectFieldRanges);

describe("applySqlDecorations", () => {
  let mockMonaco: MockMonaco;
  let mockModel: MockModel;
  let mockEditor: MockEditor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMonaco = createMockMonaco();
    mockModel = createMockModel("SELECT Name FROM [Customers]");
    const { editor } = createMockEditor(mockModel);
    mockEditor = editor;
  });

  it("returns currentDecorationIds unchanged when editor has no model", () => {
    const { editor } = createMockEditor(null);
    const currentIds = ["deco-1", "deco-2"];

    const result = applySqlDecorations({
      editor: editor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      diagnostics: [],
      currentDecorationIds: currentIds,
      maxErrorTokenLength: 100,
    });

    expect(result).toBe(currentIds);
    expect(editor.deltaDecorations).not.toHaveBeenCalled();
  });

  it("creates table decorations with correct CSS class", () => {
    mockedExtractTableReferences.mockReturnValue([
      {
        name: "Customers",
        qualifiedName: "Customers",
        startIndex: 18,
        endIndex: 27,
        isBracketed: true,
        isSubquery: false,
        scopeDepth: 0,
        outputFields: [],
      },
    ]);
    mockedExtractSelectFieldRanges.mockReturnValue([]);

    applySqlDecorations({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      diagnostics: [],
      currentDecorationIds: [],
      maxErrorTokenLength: 100,
    });

    expect(mockEditor.deltaDecorations).toHaveBeenCalledTimes(1);
    const decorations = ((
      mockEditor.deltaDecorations as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[1] ?? []) as Array<{
      options: { inlineClassName: string };
    }>;
    const tableDecos = decorations.filter(
      (d) => d.options.inlineClassName === "monaco-de-name",
    );
    expect(tableDecos).toHaveLength(1);
  });

  it("creates field and alias decorations with correct CSS classes", () => {
    mockedExtractTableReferences.mockReturnValue([]);
    mockedExtractSelectFieldRanges.mockReturnValue([
      { startIndex: 7, endIndex: 11, type: "field" },
      { startIndex: 15, endIndex: 16, type: "alias" },
    ]);

    applySqlDecorations({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      diagnostics: [],
      currentDecorationIds: [],
      maxErrorTokenLength: 100,
    });

    expect(mockEditor.deltaDecorations).toHaveBeenCalledTimes(1);
    const decorations = ((
      mockEditor.deltaDecorations as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[1] ?? []) as Array<{
      options: { inlineClassName: string };
    }>;
    const fieldDecos = decorations.filter(
      (d) => d.options.inlineClassName === "monaco-field-name",
    );
    const aliasDecos = decorations.filter(
      (d) => d.options.inlineClassName === "monaco-field-alias",
    );
    expect(fieldDecos).toHaveLength(1);
    expect(aliasDecos).toHaveLength(1);
  });

  it("filters error tokens by maxErrorTokenLength", () => {
    mockedExtractTableReferences.mockReturnValue([]);
    mockedExtractSelectFieldRanges.mockReturnValue([]);

    applySqlDecorations({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      diagnostics: [
        {
          message: "short error",
          severity: "error",
          startIndex: 0,
          endIndex: 5,
        },
        {
          message: "long error",
          severity: "error",
          startIndex: 0,
          endIndex: 200,
        },
      ],
      currentDecorationIds: [],
      maxErrorTokenLength: 10,
    });

    const decorations = ((
      mockEditor.deltaDecorations as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[1] ?? []) as Array<{
      options: { inlineClassName: string };
    }>;
    const errorDecos = decorations.filter(
      (d) => d.options.inlineClassName === "monaco-error-token",
    );
    expect(errorDecos).toHaveLength(1);
  });

  it("applies Math.max floor when endIndex < startIndex on error tokens", () => {
    mockedExtractTableReferences.mockReturnValue([]);
    mockedExtractSelectFieldRanges.mockReturnValue([]);

    applySqlDecorations({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      diagnostics: [
        {
          message: "inverted range",
          severity: "error",
          startIndex: 5,
          endIndex: 3,
        },
      ],
      currentDecorationIds: [],
      maxErrorTokenLength: 100,
    });

    const decorations = ((
      mockEditor.deltaDecorations as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[1] ?? []) as Array<{
      options: { inlineClassName: string };
    }>;
    const errorDecos = decorations.filter(
      (d) => d.options.inlineClassName === "monaco-error-token",
    );
    expect(errorDecos).toHaveLength(1);

    expect(mockModel.getPositionAt).toHaveBeenCalledWith(6);
  });

  it("produces no decorations for empty SQL", () => {
    const emptyModel = createMockModel("");
    const { editor } = createMockEditor(emptyModel);

    mockedExtractTableReferences.mockReturnValue([]);
    mockedExtractSelectFieldRanges.mockReturnValue([]);

    applySqlDecorations({
      editor: editor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      diagnostics: [],
      currentDecorationIds: [],
      maxErrorTokenLength: 100,
    });

    expect(editor.deltaDecorations).toHaveBeenCalledWith([], []);
  });

  it("filters out subquery references from table decorations", () => {
    mockedExtractTableReferences.mockReturnValue([
      {
        name: "Customers",
        qualifiedName: "Customers",
        startIndex: 18,
        endIndex: 27,
        isBracketed: true,
        isSubquery: false,
        scopeDepth: 0,
        outputFields: [],
      },
      {
        name: "subquery",
        qualifiedName: "subquery",
        startIndex: 0,
        endIndex: 50,
        isBracketed: false,
        isSubquery: true,
        scopeDepth: 0,
        outputFields: ["col1"],
      },
    ]);
    mockedExtractSelectFieldRanges.mockReturnValue([]);

    applySqlDecorations({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      diagnostics: [],
      currentDecorationIds: [],
      maxErrorTokenLength: 100,
    });

    const decorations = ((
      mockEditor.deltaDecorations as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[1] ?? []) as Array<{
      options: { inlineClassName: string };
    }>;
    const tableDecos = decorations.filter(
      (d) => d.options.inlineClassName === "monaco-de-name",
    );
    expect(tableDecos).toHaveLength(1);
  });

  it("excludes warning diagnostics from error token decorations", () => {
    mockedExtractTableReferences.mockReturnValue([]);
    mockedExtractSelectFieldRanges.mockReturnValue([]);

    applySqlDecorations({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      diagnostics: [
        {
          message: "just a warning",
          severity: "warning",
          startIndex: 0,
          endIndex: 5,
        },
      ],
      currentDecorationIds: [],
      maxErrorTokenLength: 100,
    });

    const decorations = ((
      mockEditor.deltaDecorations as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[1] ?? []) as Array<{
      options: { inlineClassName: string };
    }>;
    const errorDecos = decorations.filter(
      (d) => d.options.inlineClassName === "monaco-error-token",
    );
    expect(errorDecos).toHaveLength(0);
  });
});
