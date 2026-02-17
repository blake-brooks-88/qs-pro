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
  registerCursorPositionListener,
  registerSqlEditorKeybindings,
} from "./register-sql-editor-keybindings";

type MonacoEditor = Parameters<
  typeof registerSqlEditorKeybindings
>[0]["editor"];
type Monaco = Parameters<typeof registerSqlEditorKeybindings>[0]["monaco"];

describe("registerSqlEditorKeybindings", () => {
  let mockMonaco: MockMonaco;
  let mockEditor: MockEditor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMonaco = createMockMonaco();
    const model = createMockModel("SELECT * FROM [Customers]");
    const { editor } = createMockEditor(model);
    mockEditor = editor;
  });

  it("registers Ctrl+S keybinding", () => {
    const onSave = vi.fn();

    registerSqlEditorKeybindings({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      getOnSave: () => onSave,
      getOnSaveAs: () => undefined,
      getOnFormat: () => undefined,
      enableSaveAs: false,
      enableRunRequest: false,
      getOnRunRequest: () => undefined,
    });

    expect(mockEditor.addCommand).toHaveBeenCalledWith(
      mockMonaco.KeyMod.CtrlCmd | mockMonaco.KeyCode.KeyS,
      expect.any(Function),
    );

    const ctrlSCall = (
      mockEditor.addCommand as ReturnType<typeof vi.fn>
    ).mock.calls.find(
      (call) =>
        call[0] === (mockMonaco.KeyMod.CtrlCmd | mockMonaco.KeyCode.KeyS),
    );
    ctrlSCall?.[1]();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("registers Ctrl+Shift+S when enableSaveAs is true", () => {
    const onSaveAs = vi.fn();

    registerSqlEditorKeybindings({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      getOnSave: () => undefined,
      getOnSaveAs: () => onSaveAs,
      getOnFormat: () => undefined,
      enableSaveAs: true,
      enableRunRequest: false,
      getOnRunRequest: () => undefined,
    });

    const expectedKey =
      mockMonaco.KeyMod.CtrlCmd |
      mockMonaco.KeyMod.Shift |
      mockMonaco.KeyCode.KeyS;
    const saveAsCall = (
      mockEditor.addCommand as ReturnType<typeof vi.fn>
    ).mock.calls.find((call) => call[0] === expectedKey);
    expect(saveAsCall).toBeDefined();

    saveAsCall?.[1]();
    expect(onSaveAs).toHaveBeenCalledTimes(1);
  });

  it("does NOT register Ctrl+Shift+S when enableSaveAs is false", () => {
    registerSqlEditorKeybindings({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      getOnSave: () => undefined,
      getOnSaveAs: () => undefined,
      getOnFormat: () => undefined,
      enableSaveAs: false,
      enableRunRequest: false,
      getOnRunRequest: () => undefined,
    });

    const expectedKey =
      mockMonaco.KeyMod.CtrlCmd |
      mockMonaco.KeyMod.Shift |
      mockMonaco.KeyCode.KeyS;
    const saveAsCall = (
      mockEditor.addCommand as ReturnType<typeof vi.fn>
    ).mock.calls.find((call) => call[0] === expectedKey);
    expect(saveAsCall).toBeUndefined();
  });

  it("registers Ctrl+Enter when enableRunRequest is true", () => {
    const onRunRequest = vi.fn();

    registerSqlEditorKeybindings({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      getOnSave: () => undefined,
      getOnSaveAs: () => undefined,
      getOnFormat: () => undefined,
      enableSaveAs: false,
      enableRunRequest: true,
      getOnRunRequest: () => onRunRequest,
    });

    const expectedKey = mockMonaco.KeyMod.CtrlCmd | mockMonaco.KeyCode.Enter;
    const runCall = (
      mockEditor.addCommand as ReturnType<typeof vi.fn>
    ).mock.calls.find((call) => call[0] === expectedKey);
    expect(runCall).toBeDefined();

    runCall?.[1]();
    expect(onRunRequest).toHaveBeenCalledTimes(1);
  });

  it("does NOT register Ctrl+Enter when enableRunRequest is false", () => {
    registerSqlEditorKeybindings({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      getOnSave: () => undefined,
      getOnSaveAs: () => undefined,
      getOnFormat: () => undefined,
      enableSaveAs: false,
      enableRunRequest: false,
      getOnRunRequest: () => undefined,
    });

    const expectedKey = mockMonaco.KeyMod.CtrlCmd | mockMonaco.KeyCode.Enter;
    const runCall = (
      mockEditor.addCommand as ReturnType<typeof vi.fn>
    ).mock.calls.find((call) => call[0] === expectedKey);
    expect(runCall).toBeUndefined();
  });

  it("registers Ctrl+/ for toggle comment", () => {
    registerSqlEditorKeybindings({
      editor: mockEditor as unknown as MonacoEditor,
      monaco: mockMonaco as unknown as Monaco,
      getOnSave: () => undefined,
      getOnSaveAs: () => undefined,
      getOnFormat: () => undefined,
      enableSaveAs: false,
      enableRunRequest: false,
      getOnRunRequest: () => undefined,
    });

    const expectedKey = mockMonaco.KeyMod.CtrlCmd | mockMonaco.KeyCode.Slash;
    const commentCall = (
      mockEditor.addCommand as ReturnType<typeof vi.fn>
    ).mock.calls.find((call) => call[0] === expectedKey);
    expect(commentCall).toBeDefined();

    commentCall?.[1]();
    expect(mockEditor.getAction).toHaveBeenCalledWith(
      "editor.action.commentLine",
    );
  });
});

describe("registerCursorPositionListener", () => {
  let mockModel: MockModel;
  let mockEditor: MockEditor;
  let callbacks: MockEditorCallbacks;

  beforeEach(() => {
    vi.clearAllMocks();
    mockModel = createMockModel("SELECT * FROM [Customers]");
    const created = createMockEditor(mockModel);
    mockEditor = created.editor;
    callbacks = created.callbacks;
  });

  it("calls onCursorPositionChange with offset from cursor event", () => {
    const onCursorPositionChange = vi.fn();
    mockModel.getOffsetAt.mockReturnValue(7);

    registerCursorPositionListener({
      editor: mockEditor as unknown as MonacoEditor,
      onCursorPositionChange,
    });

    callbacks.cursorPositionCallbacks[0]?.({
      position: { lineNumber: 1, column: 8 },
    });

    expect(onCursorPositionChange).toHaveBeenCalledWith(7);
  });

  it("returns a disposable", () => {
    const disposable = registerCursorPositionListener({
      editor: mockEditor as unknown as MonacoEditor,
      onCursorPositionChange: vi.fn(),
    });

    expect(disposable).toHaveProperty("dispose");
    expect(typeof disposable.dispose).toBe("function");
  });

  it("does not call onCursorPositionChange when model is null", () => {
    const { editor, callbacks: nullCallbacks } = createMockEditor(null);
    const onCursorPositionChange = vi.fn();

    registerCursorPositionListener({
      editor: editor as unknown as MonacoEditor,
      onCursorPositionChange,
    });

    nullCallbacks.cursorPositionCallbacks[0]?.({
      position: { lineNumber: 1, column: 1 },
    });

    expect(onCursorPositionChange).not.toHaveBeenCalled();
  });
});
