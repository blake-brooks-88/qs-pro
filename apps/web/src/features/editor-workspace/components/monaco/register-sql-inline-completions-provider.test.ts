import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMockModel,
  createMockMonaco,
  type MockModel,
  type MockMonaco,
} from "@/test/monaco-mock-factory";

import { registerSqlInlineCompletionsProvider } from "./register-sql-inline-completions-provider";

vi.mock("@/features/editor-workspace/utils/inline-suggestions", () => ({
  evaluateInlineSuggestions: vi.fn(async () => null),
}));

vi.mock("@/features/editor-workspace/utils/inline-completion-range", () => ({
  getInlineCompletionReplacementEndOffset: vi.fn(
    (_sql: string, cursorIndex: number) => cursorIndex,
  ),
}));

vi.mock("@/features/editor-workspace/utils/sql-context", () => ({
  getSqlCursorContext: vi.fn(() => ({
    cursorDepth: 0,
    currentWord: "",
    aliasBeforeDot: null,
    isAfterFromJoin: false,
    isAfterSelect: false,
    lastKeyword: null,
    hasTableReference: false,
    cursorInTableReference: false,
    hasFromJoinTable: false,
    cursorInFromJoinTable: false,
    tablesInScope: [],
    aliasMap: new Map(),
  })),
}));

import { getInlineCompletionReplacementEndOffset } from "@/features/editor-workspace/utils/inline-completion-range";
import { evaluateInlineSuggestions } from "@/features/editor-workspace/utils/inline-suggestions";

type Monaco = Parameters<
  typeof registerSqlInlineCompletionsProvider
>[0]["monaco"];

const mockedEvaluateInlineSuggestions = vi.mocked(evaluateInlineSuggestions);
const mockedGetEndOffset = vi.mocked(getInlineCompletionReplacementEndOffset);

interface InlineProvider {
  provideInlineCompletions: (
    model: MockModel,
    position: { lineNumber: number; column: number },
  ) => Promise<{ items: Array<{ insertText: string; range: unknown }> }>;
}

describe("registerSqlInlineCompletionsProvider", () => {
  let mockMonaco: MockMonaco;
  let mockModel: MockModel;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMonaco = createMockMonaco();
    mockModel = createMockModel("SELECT * FROM [Customers]");
  });

  const getProvider = (): InlineProvider => {
    const calls = (
      mockMonaco.languages.registerInlineCompletionsProvider as ReturnType<
        typeof vi.fn
      >
    ).mock.calls;
    return (calls[0]?.[1] ?? null) as InlineProvider;
  };

  it("registers a provider and returns a disposable", () => {
    const disposable = registerSqlInlineCompletionsProvider({
      monaco: mockMonaco as unknown as Monaco,
      resolveDataExtension: () => undefined,
      fetchFields: async () => [],
    });

    expect(
      mockMonaco.languages.registerInlineCompletionsProvider,
    ).toHaveBeenCalledTimes(1);
    expect(
      mockMonaco.languages.registerInlineCompletionsProvider,
    ).toHaveBeenCalledWith(
      "sql",
      expect.objectContaining({
        provideInlineCompletions: expect.any(Function),
      }),
    );
    expect(disposable).toHaveProperty("dispose");
  });

  it("returns empty items when suggestion is null", async () => {
    mockedEvaluateInlineSuggestions.mockResolvedValue(null);

    registerSqlInlineCompletionsProvider({
      monaco: mockMonaco as unknown as Monaco,
      resolveDataExtension: () => undefined,
      fetchFields: async () => [],
    });

    const provider = getProvider();
    const result = await provider.provideInlineCompletions(mockModel, {
      lineNumber: 1,
      column: 1,
    });

    expect(result.items).toEqual([]);
  });

  it("returns suggestion with correct replacement range", async () => {
    mockedEvaluateInlineSuggestions.mockResolvedValue({
      text: "[Customers]",
      priority: 10,
    });
    mockedGetEndOffset.mockReturnValue(25);
    mockModel.getPositionAt.mockReturnValue({ lineNumber: 1, column: 26 });

    registerSqlInlineCompletionsProvider({
      monaco: mockMonaco as unknown as Monaco,
      resolveDataExtension: () => undefined,
      fetchFields: async () => [],
    });

    const provider = getProvider();
    const result = await provider.provideInlineCompletions(mockModel, {
      lineNumber: 1,
      column: 15,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.insertText).toBe("[Customers]");
    expect(mockMonaco.Range).toHaveBeenCalled();
  });

  it("returns suggestion with alternatives", async () => {
    mockedEvaluateInlineSuggestions.mockResolvedValue({
      text: "Name",
      priority: 5,
      alternatives: ["Email", "Phone"],
    });
    mockedGetEndOffset.mockReturnValue(14);
    mockModel.getPositionAt.mockReturnValue({ lineNumber: 1, column: 15 });

    registerSqlInlineCompletionsProvider({
      monaco: mockMonaco as unknown as Monaco,
      resolveDataExtension: () => undefined,
      fetchFields: async () => [],
    });

    const provider = getProvider();
    const result = await provider.provideInlineCompletions(mockModel, {
      lineNumber: 1,
      column: 8,
    });

    expect(result.items).toHaveLength(3);
    expect(result.items[0]?.insertText).toBe("Name");
    expect(result.items[1]?.insertText).toBe("Email");
    expect(result.items[2]?.insertText).toBe("Phone");
  });

  it("resolves subquery fields without calling fetchFields", async () => {
    const fetchFields = vi.fn(async () => []);

    mockedEvaluateInlineSuggestions.mockImplementation(async (ctx) => {
      const table = ctx.tablesInScope[0];
      if (table?.isSubquery) {
        const fields = await ctx.getFieldsForTable(table);
        return {
          text: fields.map((f) => f.name).join(", "),
          priority: 1,
        };
      }
      return null;
    });

    vi.mocked(
      await import("@/features/editor-workspace/utils/sql-context"),
    ).getSqlCursorContext.mockReturnValue({
      cursorDepth: 0,
      currentWord: "",
      aliasBeforeDot: null,
      isAfterFromJoin: false,
      isAfterSelect: true,
      lastKeyword: "select",
      hasTableReference: false,
      cursorInTableReference: false,
      hasFromJoinTable: false,
      cursorInFromJoinTable: false,
      tablesInScope: [
        {
          name: "subquery",
          qualifiedName: "subquery",
          alias: "sq",
          startIndex: 0,
          endIndex: 50,
          isBracketed: false,
          isSubquery: true,
          scopeDepth: 0,
          outputFields: ["Name", "Email"],
        },
      ],
      aliasMap: new Map(),
    });

    mockedGetEndOffset.mockReturnValue(8);
    mockModel.getPositionAt.mockReturnValue({ lineNumber: 1, column: 9 });

    registerSqlInlineCompletionsProvider({
      monaco: mockMonaco as unknown as Monaco,
      resolveDataExtension: () => undefined,
      fetchFields,
    });

    const provider = getProvider();
    const result = await provider.provideInlineCompletions(mockModel, {
      lineNumber: 1,
      column: 8,
    });

    expect(fetchFields).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.insertText).toBe("Name, Email");
  });

  it("resolves regular table fields via fetchFields", async () => {
    const fetchFields = vi.fn(async () => [
      {
        name: "Email",
        type: "EmailAddress" as const,
        isPrimaryKey: false,
        isNullable: true,
      },
    ]);

    mockedEvaluateInlineSuggestions.mockImplementation(async (ctx) => {
      const table = ctx.tablesInScope[0];
      if (table) {
        const fields = await ctx.getFieldsForTable(table);
        return {
          text: fields.map((f) => f.name).join(", "),
          priority: 1,
        };
      }
      return null;
    });

    vi.mocked(
      await import("@/features/editor-workspace/utils/sql-context"),
    ).getSqlCursorContext.mockReturnValue({
      cursorDepth: 0,
      currentWord: "",
      aliasBeforeDot: null,
      isAfterFromJoin: false,
      isAfterSelect: true,
      lastKeyword: "select",
      hasTableReference: false,
      cursorInTableReference: false,
      hasFromJoinTable: false,
      cursorInFromJoinTable: false,
      tablesInScope: [
        {
          name: "Customers",
          qualifiedName: "Customers",
          startIndex: 14,
          endIndex: 25,
          isBracketed: true,
          isSubquery: false,
          scopeDepth: 0,
          outputFields: [],
        },
      ],
      aliasMap: new Map(),
    });

    mockedGetEndOffset.mockReturnValue(8);
    mockModel.getPositionAt.mockReturnValue({ lineNumber: 1, column: 9 });

    registerSqlInlineCompletionsProvider({
      monaco: mockMonaco as unknown as Monaco,
      resolveDataExtension: () => ({ customerKey: "Customers" }),
      fetchFields,
    });

    const provider = getProvider();
    const result = await provider.provideInlineCompletions(mockModel, {
      lineNumber: 1,
      column: 8,
    });

    expect(fetchFields).toHaveBeenCalledWith("Customers");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.insertText).toBe("Email");
  });
});
