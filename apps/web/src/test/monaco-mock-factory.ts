import { vi } from "vitest";

export function createMockDisposable() {
  return { dispose: vi.fn() };
}

export function createMockModel(value: string) {
  const lines = value.split("\n");

  return {
    getValue: vi.fn(() => value),
    getPositionAt: vi.fn((offset: number) => {
      let remaining = offset;
      for (let i = 0; i < lines.length; i++) {
        const lineLen = (lines[i]?.length ?? 0) + 1;
        if (remaining < lineLen || i === lines.length - 1) {
          return { lineNumber: i + 1, column: remaining + 1 };
        }
        remaining -= lineLen;
      }
      return { lineNumber: 1, column: 1 };
    }),
    getOffsetAt: vi.fn(
      (pos: { lineNumber: number; column: number }): number => {
        let offset = 0;
        for (let i = 0; i < pos.lineNumber - 1 && i < lines.length; i++) {
          offset += (lines[i]?.length ?? 0) + 1;
        }
        return offset + pos.column - 1;
      },
    ),
    getLineContent: vi.fn((line: number) => lines[line - 1] ?? ""),
    getValueInRange: vi.fn(() => ""),
    getWordUntilPosition: vi.fn(() => ({
      word: "",
      startColumn: 1,
      endColumn: 1,
    })),
  };
}

export type MockModel = ReturnType<typeof createMockModel>;

export interface MockEditorCallbacks {
  contentChangeCallbacks: Array<(e: unknown) => void>;
  cursorPositionCallbacks: Array<(e: unknown) => void>;
  keyDownCallbacks: Array<(e: unknown) => void>;
}

export function createMockEditor(model?: MockModel | null) {
  const callbacks: MockEditorCallbacks = {
    contentChangeCallbacks: [],
    cursorPositionCallbacks: [],
    keyDownCallbacks: [],
  };

  const editor = {
    focus: vi.fn(),
    getModel: vi.fn(() => model ?? null),
    addCommand: vi.fn(),
    onKeyDown: vi.fn((cb: (e: unknown) => void) => {
      callbacks.keyDownCallbacks.push(cb);
      return createMockDisposable();
    }),
    onDidChangeModelContent: vi.fn((cb: (e: unknown) => void) => {
      callbacks.contentChangeCallbacks.push(cb);
      return createMockDisposable();
    }),
    onDidChangeCursorPosition: vi.fn((cb: (e: unknown) => void) => {
      callbacks.cursorPositionCallbacks.push(cb);
      return createMockDisposable();
    }),
    deltaDecorations: vi.fn(() => []),
    trigger: vi.fn(),
    executeEdits: vi.fn(),
    setPosition: vi.fn(),
    getPosition: vi.fn(() => ({ lineNumber: 1, column: 1 })),
    getAction: vi.fn(() => ({ run: vi.fn() })),
  };

  return { editor, callbacks };
}

export type MockEditor = ReturnType<typeof createMockEditor>["editor"];

export function createMockMonaco() {
  return {
    KeyMod: { CtrlCmd: 1, Shift: 2, Alt: 4, WinCtrl: 8 },
    KeyCode: { KeyS: 49, Enter: 3, Tab: 2, Slash: 56, KeyF: 36 },
    Range: vi.fn((sl: number, sc: number, el: number, ec: number) => ({
      startLineNumber: sl,
      startColumn: sc,
      endLineNumber: el,
      endColumn: ec,
    })),
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
    editor: {
      setModelMarkers: vi.fn(),
      defineTheme: vi.fn(),
      setTheme: vi.fn(),
    },
    languages: {
      registerCompletionItemProvider: vi.fn(() => createMockDisposable()),
      registerInlineCompletionsProvider: vi.fn(() => createMockDisposable()),
      setLanguageConfiguration: vi.fn(),
      setMonarchTokensProvider: vi.fn(),
      CompletionItemKind: {
        Keyword: 14,
        Field: 5,
        Struct: 22,
        Snippet: 27,
        Issue: 26,
      },
      CompletionTriggerKind: { Invoke: 0, TriggerCharacter: 1 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      IndentAction: { Indent: 1, Outdent: 3 },
    },
  };
}

export type MockMonaco = ReturnType<typeof createMockMonaco>;
