import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMockEditor,
  createMockModel,
  createMockMonaco,
  type MockEditor,
  type MockEditorCallbacks,
  type MockModel,
  type MockMonaco,
} from "@/test/monaco-mock-factory";

import {
  registerSqlAutoBracketInsertOnFromJoin,
  registerSqlSuggestRetriggerOnDot,
  registerSqlTabExpandFromJoin,
} from "./register-sql-auto-bracket-behavior";

type MonacoEditor = Parameters<
  typeof registerSqlAutoBracketInsertOnFromJoin
>["0"]["editor"];
type Monaco = Parameters<typeof registerSqlTabExpandFromJoin>["0"]["monaco"];

vi.mock(
  "@/features/editor-workspace/utils/sql-context",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/features/editor-workspace/utils/sql-context")
      >();
    return {
      ...actual,
      getSqlCursorContext: vi.fn(actual.getSqlCursorContext),
    };
  },
);

import { getSqlCursorContext } from "@/features/editor-workspace/utils/sql-context";

const mockedGetSqlCursorContext = vi.mocked(getSqlCursorContext);

describe("registerSqlAutoBracketInsertOnFromJoin", () => {
  let mockModel: MockModel;
  let mockEditor: MockEditor;
  let callbacks: MockEditorCallbacks;
  let autoBracketRef: { current: boolean };

  beforeEach(() => {
    vi.clearAllMocks();
    mockModel = createMockModel("SELECT * FROM ");
    const created = createMockEditor(mockModel);
    mockEditor = created.editor;
    callbacks = created.callbacks;
    autoBracketRef = { current: false };
  });

  it("returns a disposable", () => {
    const disposable = registerSqlAutoBracketInsertOnFromJoin({
      editor: mockEditor as unknown as MonacoEditor,
      autoBracketRef,
    });

    expect(disposable).toHaveProperty("dispose");
    expect(typeof disposable.dispose).toBe("function");
  });

  it("inserts [ when user types space after FROM", () => {
    registerSqlAutoBracketInsertOnFromJoin({
      editor: mockEditor as unknown as MonacoEditor,
      autoBracketRef,
    });

    const sql = "SELECT * FROM ";
    mockModel.getValue.mockReturnValue(sql);
    mockModel.getPositionAt.mockReturnValue({ lineNumber: 1, column: 15 });
    mockModel.getValueInRange.mockReturnValue("");

    callbacks.contentChangeCallbacks[0]?.({
      changes: [{ rangeOffset: 13, text: " ", rangeLength: 0 }],
    });

    expect(mockEditor.trigger).toHaveBeenCalledWith("keyboard", "type", {
      text: "[",
    });
  });

  it("inserts [ when user types space after JOIN", () => {
    registerSqlAutoBracketInsertOnFromJoin({
      editor: mockEditor as unknown as MonacoEditor,
      autoBracketRef,
    });

    const sql = "SELECT * FROM [Customers] JOIN ";
    mockModel.getValue.mockReturnValue(sql);
    mockModel.getPositionAt.mockReturnValue({ lineNumber: 1, column: 31 });
    mockModel.getValueInRange.mockReturnValue("");

    callbacks.contentChangeCallbacks[0]?.({
      changes: [{ rangeOffset: 30, text: " ", rangeLength: 0 }],
    });

    expect(mockEditor.trigger).toHaveBeenCalledWith("keyboard", "type", {
      text: "[",
    });
  });

  it("does NOT insert when autoBracketRef.current is true", () => {
    autoBracketRef.current = true;

    registerSqlAutoBracketInsertOnFromJoin({
      editor: mockEditor as unknown as MonacoEditor,
      autoBracketRef,
    });

    callbacks.contentChangeCallbacks[0]?.({
      changes: [{ rangeOffset: 13, text: " ", rangeLength: 0 }],
    });

    expect(mockEditor.trigger).not.toHaveBeenCalled();
  });

  it("does NOT insert when model is null", () => {
    const { editor, callbacks: nullCallbacks } = createMockEditor(null);

    registerSqlAutoBracketInsertOnFromJoin({
      editor: editor as unknown as MonacoEditor,
      autoBracketRef,
    });

    nullCallbacks.contentChangeCallbacks[0]?.({
      changes: [{ rangeOffset: 13, text: " ", rangeLength: 0 }],
    });

    expect(editor.trigger).not.toHaveBeenCalled();
  });

  it("does NOT insert when next char is already [", () => {
    registerSqlAutoBracketInsertOnFromJoin({
      editor: mockEditor as unknown as MonacoEditor,
      autoBracketRef,
    });

    const sql = "SELECT * FROM [Customers]";
    mockModel.getValue.mockReturnValue(sql);
    mockModel.getPositionAt.mockReturnValue({ lineNumber: 1, column: 15 });
    mockModel.getValueInRange.mockReturnValue("[");

    callbacks.contentChangeCallbacks[0]?.({
      changes: [{ rangeOffset: 13, text: " ", rangeLength: 0 }],
    });

    expect(mockEditor.trigger).not.toHaveBeenCalled();
  });

  it("does NOT insert when text is not after FROM or JOIN", () => {
    registerSqlAutoBracketInsertOnFromJoin({
      editor: mockEditor as unknown as MonacoEditor,
      autoBracketRef,
    });

    const sql = "SELECT ";
    mockModel.getValue.mockReturnValue(sql);

    callbacks.contentChangeCallbacks[0]?.({
      changes: [{ rangeOffset: 6, text: " ", rangeLength: 0 }],
    });

    expect(mockEditor.trigger).not.toHaveBeenCalled();
  });
});

describe("registerSqlSuggestRetriggerOnDot", () => {
  let mockModel: MockModel;
  let mockEditor: MockEditor;
  let callbacks: MockEditorCallbacks;

  beforeEach(() => {
    vi.clearAllMocks();
    mockModel = createMockModel("SELECT a.N FROM [Customers] a");
    const created = createMockEditor(mockModel);
    mockEditor = created.editor;
    callbacks = created.callbacks;
  });

  it("returns a disposable", () => {
    const disposable = registerSqlSuggestRetriggerOnDot({
      editor: mockEditor as unknown as MonacoEditor,
    });

    expect(disposable).toHaveProperty("dispose");
  });

  it("retriggers suggest when typing letter after dot", () => {
    registerSqlSuggestRetriggerOnDot({
      editor: mockEditor as unknown as MonacoEditor,
    });

    const sql = "SELECT a.N FROM [Customers] a";
    mockModel.getValue.mockReturnValue(sql);

    callbacks.contentChangeCallbacks[0]?.({
      changes: [{ rangeOffset: 9, text: "N", rangeLength: 0 }],
    });

    expect(mockEditor.trigger).toHaveBeenCalledWith(
      "retrigger",
      "editor.action.triggerSuggest",
      {},
    );
  });

  it("ignores non-single-char changes", () => {
    registerSqlSuggestRetriggerOnDot({
      editor: mockEditor as unknown as MonacoEditor,
    });

    callbacks.contentChangeCallbacks[0]?.({
      changes: [{ rangeOffset: 9, text: "Na", rangeLength: 0 }],
    });

    expect(mockEditor.trigger).not.toHaveBeenCalled();
  });

  it("ignores non-alphanumeric chars", () => {
    registerSqlSuggestRetriggerOnDot({
      editor: mockEditor as unknown as MonacoEditor,
    });

    const sql = "SELECT a. FROM [Customers] a";
    mockModel.getValue.mockReturnValue(sql);

    callbacks.contentChangeCallbacks[0]?.({
      changes: [{ rangeOffset: 9, text: " ", rangeLength: 0 }],
    });

    expect(mockEditor.trigger).not.toHaveBeenCalled();
  });

  it("ignores when char before is not a dot", () => {
    registerSqlSuggestRetriggerOnDot({
      editor: mockEditor as unknown as MonacoEditor,
    });

    const sql = "SELECT aXN FROM [Customers] a";
    mockModel.getValue.mockReturnValue(sql);

    callbacks.contentChangeCallbacks[0]?.({
      changes: [{ rangeOffset: 9, text: "N", rangeLength: 0 }],
    });

    expect(mockEditor.trigger).not.toHaveBeenCalled();
  });

  it("ignores when model is null", () => {
    const { editor, callbacks: nullCallbacks } = createMockEditor(null);

    registerSqlSuggestRetriggerOnDot({
      editor: editor as unknown as MonacoEditor,
    });

    nullCallbacks.contentChangeCallbacks[0]?.({
      changes: [{ rangeOffset: 9, text: "N", rangeLength: 0 }],
    });

    expect(editor.trigger).not.toHaveBeenCalled();
  });
});

describe("registerSqlTabExpandFromJoin", () => {
  let mockMonaco: MockMonaco;
  let mockModel: MockModel;
  let mockEditor: MockEditor;
  let callbacks: MockEditorCallbacks;
  let autoBracketRef: { current: boolean };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMonaco = createMockMonaco();
    mockModel = createMockModel("SELECT * from");
    const created = createMockEditor(mockModel);
    mockEditor = created.editor;
    callbacks = created.callbacks;
    autoBracketRef = { current: false };

    vi.useFakeTimers();
  });

  const fireKeyDown = (
    keyCode: number,
    modifiers?: Partial<{
      shiftKey: boolean;
      ctrlKey: boolean;
      altKey: boolean;
      metaKey: boolean;
    }>,
  ) => {
    callbacks.keyDownCallbacks[0]?.({
      keyCode,
      shiftKey: modifiers?.shiftKey ?? false,
      ctrlKey: modifiers?.ctrlKey ?? false,
      altKey: modifiers?.altKey ?? false,
      metaKey: modifiers?.metaKey ?? false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
  };

  it("returns a disposable", () => {
    const disposable = registerSqlTabExpandFromJoin({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      autoBracketRef,
    });

    expect(disposable).toHaveProperty("dispose");
  });

  it("expands 'from' to 'FROM ' and inserts [ on Tab", () => {
    const sql = "SELECT * from";
    mockModel.getValue.mockReturnValue(sql);
    mockEditor.getPosition.mockReturnValue({ lineNumber: 1, column: 14 });
    mockModel.getOffsetAt.mockReturnValue(13);
    mockModel.getWordUntilPosition.mockReturnValue({
      word: "from",
      startColumn: 10,
      endColumn: 14,
    });
    mockModel.getValueInRange.mockReturnValue("m");

    mockedGetSqlCursorContext.mockReturnValue({
      cursorDepth: 0,
      currentWord: "from",
      aliasBeforeDot: null,
      isAfterFromJoin: false,
      isAfterSelect: true,
      lastKeyword: "select",
      hasTableReference: false,
      cursorInTableReference: false,
      hasFromJoinTable: false,
      cursorInFromJoinTable: false,
      tablesInScope: [],
      aliasMap: new Map(),
    });

    registerSqlTabExpandFromJoin({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      autoBracketRef,
    });

    fireKeyDown(mockMonaco.KeyCode.Tab);

    expect(mockEditor.executeEdits).toHaveBeenCalledWith("auto-bracket-tab", [
      expect.objectContaining({
        text: "FROM ",
      }),
    ]);
  });

  it("expands 'join' to 'JOIN ' on Tab", () => {
    const sql = "SELECT * FROM [Customers] join";
    mockModel.getValue.mockReturnValue(sql);
    mockEditor.getPosition.mockReturnValue({ lineNumber: 1, column: 30 });
    mockModel.getOffsetAt.mockReturnValue(29);
    mockModel.getWordUntilPosition.mockReturnValue({
      word: "join",
      startColumn: 27,
      endColumn: 30,
    });
    mockModel.getValueInRange.mockReturnValue("n");

    mockedGetSqlCursorContext.mockReturnValue({
      cursorDepth: 0,
      currentWord: "join",
      aliasBeforeDot: null,
      isAfterFromJoin: true,
      isAfterSelect: false,
      lastKeyword: "from",
      hasTableReference: true,
      cursorInTableReference: false,
      hasFromJoinTable: false,
      cursorInFromJoinTable: false,
      tablesInScope: [],
      aliasMap: new Map(),
    });

    registerSqlTabExpandFromJoin({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      autoBracketRef,
    });

    fireKeyDown(mockMonaco.KeyCode.Tab);

    expect(mockEditor.executeEdits).toHaveBeenCalledWith("auto-bracket-tab", [
      expect.objectContaining({
        text: "JOIN ",
      }),
    ]);
  });

  it("ignores non-Tab keys", () => {
    registerSqlTabExpandFromJoin({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      autoBracketRef,
    });

    fireKeyDown(mockMonaco.KeyCode.Enter);

    expect(mockEditor.executeEdits).not.toHaveBeenCalled();
  });

  it("ignores when modifier keys are pressed", () => {
    mockModel.getValue.mockReturnValue("SELECT * from");
    mockEditor.getPosition.mockReturnValue({ lineNumber: 1, column: 14 });
    mockModel.getOffsetAt.mockReturnValue(13);
    mockModel.getWordUntilPosition.mockReturnValue({
      word: "from",
      startColumn: 10,
      endColumn: 14,
    });

    registerSqlTabExpandFromJoin({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      autoBracketRef,
    });

    fireKeyDown(mockMonaco.KeyCode.Tab, { shiftKey: true });

    expect(mockEditor.executeEdits).not.toHaveBeenCalled();
  });

  it("ignores when table already exists after FROM/JOIN", () => {
    const sql = "SELECT * FROM [Customers] join";
    mockModel.getValue.mockReturnValue(sql);
    mockEditor.getPosition.mockReturnValue({ lineNumber: 1, column: 30 });
    mockModel.getOffsetAt.mockReturnValue(29);
    mockModel.getWordUntilPosition.mockReturnValue({
      word: "join",
      startColumn: 27,
      endColumn: 30,
    });
    mockModel.getValueInRange.mockReturnValue("n");

    mockedGetSqlCursorContext.mockReturnValue({
      cursorDepth: 0,
      currentWord: "join",
      aliasBeforeDot: null,
      isAfterFromJoin: true,
      isAfterSelect: false,
      lastKeyword: "from",
      hasTableReference: true,
      cursorInTableReference: false,
      hasFromJoinTable: true,
      cursorInFromJoinTable: false,
      tablesInScope: [],
      aliasMap: new Map(),
    });

    registerSqlTabExpandFromJoin({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      autoBracketRef,
    });

    fireKeyDown(mockMonaco.KeyCode.Tab);

    expect(mockEditor.executeEdits).not.toHaveBeenCalled();
  });

  it("does not expand when model is null", () => {
    const { editor, callbacks: nullCallbacks } = createMockEditor(null);

    registerSqlTabExpandFromJoin({
      editor: editor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      autoBracketRef,
    });

    nullCallbacks.keyDownCallbacks[0]?.({
      keyCode: mockMonaco.KeyCode.Tab,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(editor.executeEdits).not.toHaveBeenCalled();
  });
});
