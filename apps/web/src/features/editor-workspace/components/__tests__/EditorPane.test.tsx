import type { OnMount } from "@monaco-editor/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SqlDiagnostic } from "@/features/editor-workspace/utils/sql-diagnostics";

/**
 * Monaco Editor Mock
 *
 * The Monaco Editor is a complex external dependency that operates heavily with
 * browser APIs (canvas, web workers, etc.). Rather than testing Monaco internals,
 * we capture the callback behaviors that our component relies on:
 * - onMount callback to register keybindings and completions
 * - value/onChange for controlled input
 * - theme configuration
 *
 * This mock allows us to test component behaviors without Monaco's runtime.
 */
const mockEditorInstance = {
  focus: vi.fn(),
  getModel: vi.fn(() => ({
    getValue: () => "SELECT * FROM [Test]",
    getOffsetAt: vi.fn(() => 0),
    getPositionAt: vi.fn(() => ({ lineNumber: 1, column: 1 })),
    getLineContent: vi.fn(() => "SELECT * FROM [Test]"),
    getValueInRange: vi.fn(() => ""),
    getWordUntilPosition: vi.fn(() => ({
      word: "",
      startColumn: 1,
      endColumn: 1,
    })),
  })),
  addCommand: vi.fn(),
  onKeyDown: vi.fn(),
  onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
  onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
  deltaDecorations: vi.fn(() => []),
  trigger: vi.fn(),
  executeEdits: vi.fn(),
  setPosition: vi.fn(),
  getPosition: vi.fn(() => ({ lineNumber: 1, column: 1 })),
  getAction: vi.fn(() => ({ run: vi.fn() })),
};

const mockMonacoInstance = {
  KeyMod: { CtrlCmd: 1, Shift: 2, Alt: 4, WinCtrl: 8 },
  KeyCode: { KeyS: 49, Enter: 3, Tab: 2, Slash: 56 },
  Range: vi.fn((sl, sc, el, ec) => ({
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
    registerCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerInlineCompletionsProvider: vi.fn(() => ({ dispose: vi.fn() })),
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

let capturedOnMount: OnMount | null = null;

vi.mock("@monaco-editor/react", () => ({
  default: vi.fn(({ value, onChange, onMount }) => {
    // Capture onMount for test access
    capturedOnMount = onMount;
    return (
      <div data-testid="monaco-editor">
        <textarea
          data-testid="monaco-textarea"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
        />
      </div>
    );
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

// Lazy import to ensure mocks are in place
const importMonacoQueryEditor = async () => {
  const module = await import("../MonacoQueryEditor");
  return module.MonacoQueryEditor;
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

describe("MonacoQueryEditor Component", () => {
  let MonacoQueryEditor: Awaited<ReturnType<typeof importMonacoQueryEditor>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedOnMount = null;
    MonacoQueryEditor = await importMonacoQueryEditor();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Monaco Editor Initialization", () => {
    it("renders Monaco editor container", () => {
      const queryClient = createQueryClient();
      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      expect(screen.getByTestId("monaco-editor")).toBeInTheDocument();
    });

    it("passes value to Monaco editor", () => {
      const queryClient = createQueryClient();
      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Customers]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      const textarea = screen.getByTestId("monaco-textarea");
      expect(textarea).toHaveValue("SELECT * FROM [Customers]");
    });

    it("focuses editor on mount when onMount is called", () => {
      const queryClient = createQueryClient();
      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      // Trigger onMount callback
      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      expect(mockEditorInstance.focus).toHaveBeenCalled();
    });
  });

  describe("Keyboard Shortcut Registration", () => {
    it("registers Cmd+Enter shortcut when onRunRequest is provided", () => {
      const queryClient = createQueryClient();
      const onRunRequest = vi.fn();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          onRunRequest={onRunRequest}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      // Verify addCommand was called with CtrlCmd + Enter
      expect(mockEditorInstance.addCommand).toHaveBeenCalled();
      const runRequestCall = mockEditorInstance.addCommand.mock.calls.find(
        (call) =>
          call[0] ===
          (mockMonacoInstance.KeyMod.CtrlCmd |
            mockMonacoInstance.KeyCode.Enter),
      );
      expect(runRequestCall).toBeDefined();
    });

    it("calls onRunRequest when Cmd+Enter shortcut is triggered", () => {
      const queryClient = createQueryClient();
      const onRunRequest = vi.fn();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          onRunRequest={onRunRequest}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      // Find the Cmd+Enter handler and execute it
      const runRequestCall = mockEditorInstance.addCommand.mock.calls.find(
        (call) =>
          call[0] ===
          (mockMonacoInstance.KeyMod.CtrlCmd |
            mockMonacoInstance.KeyCode.Enter),
      );
      if (runRequestCall) {
        runRequestCall[1](); // Execute the callback
      }

      expect(onRunRequest).toHaveBeenCalledTimes(1);
    });

    it("registers Cmd+S shortcut when onSave is provided", () => {
      const queryClient = createQueryClient();
      const onSave = vi.fn();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          onSave={onSave}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      const saveCall = mockEditorInstance.addCommand.mock.calls.find(
        (call) =>
          call[0] ===
          (mockMonacoInstance.KeyMod.CtrlCmd | mockMonacoInstance.KeyCode.KeyS),
      );
      expect(saveCall).toBeDefined();
    });

    it("calls onSave when Cmd+S shortcut is triggered", () => {
      const queryClient = createQueryClient();
      const onSave = vi.fn();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          onSave={onSave}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      const saveCall = mockEditorInstance.addCommand.mock.calls.find(
        (call) =>
          call[0] ===
          (mockMonacoInstance.KeyMod.CtrlCmd | mockMonacoInstance.KeyCode.KeyS),
      );
      if (saveCall) {
        saveCall[1]();
      }

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("registers Cmd+/ shortcut for comment toggling", () => {
      const queryClient = createQueryClient();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      const commentCall = mockEditorInstance.addCommand.mock.calls.find(
        (call) =>
          call[0] ===
          (mockMonacoInstance.KeyMod.CtrlCmd |
            mockMonacoInstance.KeyCode.Slash),
      );
      expect(commentCall).toBeDefined();
    });

    it("registers Cmd+Shift+S shortcut when onSaveAs is provided", () => {
      const queryClient = createQueryClient();
      const onSaveAs = vi.fn();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          onSaveAs={onSaveAs}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      const saveAsCall = mockEditorInstance.addCommand.mock.calls.find(
        (call) =>
          call[0] ===
          (mockMonacoInstance.KeyMod.CtrlCmd |
            mockMonacoInstance.KeyMod.Shift |
            mockMonacoInstance.KeyCode.KeyS),
      );
      expect(saveAsCall).toBeDefined();
    });

    it("calls onSaveAs when Cmd+Shift+S shortcut is triggered", () => {
      const queryClient = createQueryClient();
      const onSaveAs = vi.fn();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          onSaveAs={onSaveAs}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      const saveAsCall = mockEditorInstance.addCommand.mock.calls.find(
        (call) =>
          call[0] ===
          (mockMonacoInstance.KeyMod.CtrlCmd |
            mockMonacoInstance.KeyMod.Shift |
            mockMonacoInstance.KeyCode.KeyS),
      );
      if (saveAsCall) {
        saveAsCall[1]();
      }

      expect(onSaveAs).toHaveBeenCalledTimes(1);
    });
  });

  describe("Diagnostic Markers", () => {
    it("sets Monaco markers on mount with diagnostics", () => {
      const queryClient = createQueryClient();
      const diagnostics: SqlDiagnostic[] = [
        {
          message: "Unknown keyword",
          severity: "error",
          startIndex: 0,
          endIndex: 6,
        },
      ];

      render(
        <MonacoQueryEditor
          value="SELEC * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={diagnostics}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      expect(mockMonacoInstance.editor.setModelMarkers).toHaveBeenCalled();
    });

    it("passes model, source, and markers to setModelMarkers", () => {
      const queryClient = createQueryClient();
      const diagnostics: SqlDiagnostic[] = [
        {
          message: "Syntax error",
          severity: "error",
          startIndex: 0,
          endIndex: 5,
        },
      ];

      render(
        <MonacoQueryEditor
          value="ERROR"
          onChange={vi.fn()}
          diagnostics={diagnostics}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      const [model, source] =
        mockMonacoInstance.editor.setModelMarkers.mock.calls[0] ?? [];
      expect(model).toBeDefined();
      expect(source).toBe("sql-lint");
    });
  });

  describe("Autocomplete Registration", () => {
    type CompletionSuggestion = { label?: string; sortText?: string };
    type CompletionResult = { suggestions: CompletionSuggestion[] };

    type CompletionProviderConfig = {
      triggerCharacters?: string[];
      provideCompletionItems: (
        model: unknown,
        position: { lineNumber: number; column: number },
        context: { triggerKind: number },
      ) => CompletionResult | Promise<CompletionResult>;
    };

    const getRegisteredCompletionProvider = (): CompletionProviderConfig => {
      const call = mockMonacoInstance.languages.registerCompletionItemProvider
        .mock.calls[0] as unknown[] | undefined;
      if (!call) {
        throw new Error("Completion provider was not registered");
      }
      const providerConfig = call[1] as CompletionProviderConfig | undefined;
      if (!providerConfig) {
        throw new Error("Completion provider was not registered");
      }
      return providerConfig;
    };

    const createSingleLineModel = (sql: string) => {
      return {
        getValue: () => sql,
        getLineContent: () => sql,
        getOffsetAt: ({ column }: { column: number }) => column - 1,
        getPositionAt: (offset: number) => ({
          lineNumber: 1,
          column: offset + 1,
        }),
        getWordUntilPosition: ({ column }: { column: number }) => {
          const cursorIndex = column - 1;
          const textBefore = sql.slice(0, cursorIndex);
          const match = /([A-Za-z0-9_]+)$/.exec(textBefore);
          const word = match?.[1] ?? "";
          return {
            word,
            startColumn: column - word.length,
            endColumn: column,
          };
        },
      };
    };

    const invokeCompletions = async (
      sql: string,
    ): Promise<CompletionResult> => {
      const providerConfig = getRegisteredCompletionProvider();
      const model = createSingleLineModel(sql);
      return await Promise.resolve(
        providerConfig.provideCompletionItems(
          model,
          { lineNumber: 1, column: sql.length + 1 },
          {
            triggerKind:
              mockMonacoInstance.languages.CompletionTriggerKind.Invoke,
          },
        ),
      );
    };

    it("registers completion item provider for SQL language on mount", () => {
      const queryClient = createQueryClient();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      expect(
        mockMonacoInstance.languages.registerCompletionItemProvider,
      ).toHaveBeenCalledWith("sql", expect.any(Object));
    });

    it("completion provider includes trigger characters for DE and field access", () => {
      const queryClient = createQueryClient();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      const providerConfig = getRegisteredCompletionProvider();
      expect(providerConfig.triggerCharacters).toBeDefined();
      expect(providerConfig.triggerCharacters ?? []).toContain(".");
      expect(providerConfig.triggerCharacters ?? []).toContain("[");
      expect(providerConfig.triggerCharacters ?? []).toContain("_");
    });

    it("does not provide dropdown completions inside a string literal", async () => {
      const queryClient = createQueryClient();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      const result = await invokeCompletions(
        "SELECT * FROM [A] WHERE name = 'AND",
      );

      expect(result.suggestions).toHaveLength(0);
    });

    it("does not provide dropdown completions inside a comment", async () => {
      const queryClient = createQueryClient();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      const result = await invokeCompletions("SELECT * FROM [A] -- AND");

      expect(result.suggestions).toHaveLength(0);
    });

    it("prioritizes contextual keywords after WHERE", async () => {
      const queryClient = createQueryClient();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      const result = await invokeCompletions("SELECT * FROM [A] WHERE ");

      const andKeyword = result.suggestions.find(
        (suggestion) => suggestion.label === "AND",
      );

      expect(andKeyword).toBeDefined();
      expect(andKeyword?.sortText).toBe("0-AND");
    });

    it("prioritizes contextual keywords after GROUP BY", async () => {
      const queryClient = createQueryClient();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      const result = await invokeCompletions("SELECT * FROM [A] GROUP BY ");

      const havingKeyword = result.suggestions.find(
        (suggestion) => suggestion.label === "HAVING",
      );

      expect(havingKeyword).toBeDefined();
      expect(havingKeyword?.sortText).toBe("0-HAVING");
    });

    it("prioritizes contextual keywords after ORDER BY", async () => {
      const queryClient = createQueryClient();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      const result = await invokeCompletions("SELECT * FROM [A] ORDER BY ");

      const ascKeyword = result.suggestions.find(
        (suggestion) => suggestion.label === "ASC",
      );

      expect(ascKeyword).toBeDefined();
      expect(ascKeyword?.sortText).toBe("0-ASC");
    });

    it("registers inline completion provider for SQL language", () => {
      const queryClient = createQueryClient();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      expect(
        mockMonacoInstance.languages.registerInlineCompletionsProvider,
      ).toHaveBeenCalledWith("sql", expect.any(Object));
    });

    it("sets SQL language configuration with MCE-specific settings", () => {
      const queryClient = createQueryClient();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      expect(
        mockMonacoInstance.languages.setLanguageConfiguration,
      ).toHaveBeenCalledWith("sql", expect.any(Object));

      const [, config] =
        mockMonacoInstance.languages.setLanguageConfiguration.mock.calls[0] ??
        [];
      expect(config.autoClosingPairs).toContainEqual({
        open: "[",
        close: "]",
      });
    });
  });

  describe("Cursor Position Tracking", () => {
    it("registers cursor position change listener when onCursorPositionChange is provided", () => {
      const queryClient = createQueryClient();
      const onCursorPositionChange = vi.fn();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          onCursorPositionChange={onCursorPositionChange}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      expect(mockEditorInstance.onDidChangeCursorPosition).toHaveBeenCalled();
    });
  });

  describe("Content Change Handlers", () => {
    it("registers content change listener for auto-bracket insertion", () => {
      const queryClient = createQueryClient();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      // Two content change listeners: auto-bracket and suggest-retrigger
      expect(mockEditorInstance.onDidChangeModelContent).toHaveBeenCalledTimes(
        2,
      );
    });

    it("registers keydown listener for Tab key auto-expansion", () => {
      const queryClient = createQueryClient();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      if (capturedOnMount) {
        capturedOnMount(
          mockEditorInstance as unknown as Parameters<OnMount>[0],
          mockMonacoInstance as unknown as Parameters<OnMount>[1],
        );
      }

      expect(mockEditorInstance.onKeyDown).toHaveBeenCalled();
    });
  });
});
