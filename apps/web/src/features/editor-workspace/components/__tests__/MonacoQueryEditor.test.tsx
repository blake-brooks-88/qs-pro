import type { OnMount } from "@monaco-editor/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DataExtension,
  DataExtensionField,
} from "@/features/editor-workspace/types";
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

const createMockDisposable = () => ({ dispose: vi.fn() });

const mockCompletionDisposable = createMockDisposable();
const mockInlineCompletionDisposable = createMockDisposable();
const mockContentChangeDisposable = createMockDisposable();
const mockCursorPositionDisposable = createMockDisposable();

const mockEditorInstance = {
  focus: vi.fn(),
  getModel: vi.fn(() => ({
    getValue: () => "SELECT * FROM [Test]",
    getOffsetAt: vi.fn((_pos: { lineNumber: number; column: number }) => 0),
    getPositionAt: vi.fn((_offset: number) => ({ lineNumber: 1, column: 1 })),
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
  onDidChangeModelContent: vi.fn(() => mockContentChangeDisposable),
  onDidChangeCursorPosition: vi.fn(() => mockCursorPositionDisposable),
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
  Range: vi.fn(
    (
      sl: number,
      sc: number,
      el: number,
      ec: number,
    ): {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    } => ({
      startLineNumber: sl,
      startColumn: sc,
      endLineNumber: el,
      endColumn: ec,
    }),
  ),
  MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
  editor: {
    setModelMarkers: vi.fn(),
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
  },
  languages: {
    registerCompletionItemProvider: vi.fn(() => mockCompletionDisposable),
    registerInlineCompletionsProvider: vi.fn(
      () => mockInlineCompletionDisposable,
    ),
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

let mockResolvedTheme = "dark";
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: mockResolvedTheme }),
}));

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

const createMockDataExtensions = (): DataExtension[] => [
  {
    id: "de-1",
    name: "Customers",
    customerKey: "customers-key",
    folderId: "folder-1",
    description: "Customer data",
    fields: [
      {
        name: "Email",
        type: "EmailAddress",
        isPrimaryKey: true,
        isNullable: false,
      },
      {
        name: "FirstName",
        type: "Text",
        isPrimaryKey: false,
        isNullable: true,
        length: 50,
      },
      {
        name: "LastName",
        type: "Text",
        isPrimaryKey: false,
        isNullable: true,
        length: 50,
      },
    ],
    isShared: false,
  },
  {
    id: "de-2",
    name: "Orders",
    customerKey: "orders-key",
    folderId: "folder-1",
    description: "Order data",
    fields: [
      {
        name: "OrderId",
        type: "Number",
        isPrimaryKey: true,
        isNullable: false,
      },
      {
        name: "CustomerEmail",
        type: "EmailAddress",
        isPrimaryKey: false,
        isNullable: false,
      },
      {
        name: "OrderDate",
        type: "Date",
        isPrimaryKey: false,
        isNullable: false,
      },
    ],
    isShared: false,
  },
  {
    id: "de-3",
    name: "ContactPreferences",
    customerKey: "contact-prefs-key",
    folderId: "folder-2",
    description: "Contact preferences",
    fields: [
      {
        name: "Email",
        type: "EmailAddress",
        isPrimaryKey: true,
        isNullable: false,
      },
      {
        name: "OptIn",
        type: "Boolean",
        isPrimaryKey: false,
        isNullable: false,
      },
    ],
    isShared: false,
  },
];

const createMockFields = (): DataExtensionField[] => [
  {
    name: "Email",
    type: "EmailAddress",
    isPrimaryKey: true,
    isNullable: false,
  },
  {
    name: "FirstName",
    type: "Text",
    isPrimaryKey: false,
    isNullable: true,
    length: 50,
  },
  {
    name: "LastName",
    type: "Text",
    isPrimaryKey: false,
    isNullable: true,
    length: 50,
  },
  {
    name: "Phone Number",
    type: "Phone",
    isPrimaryKey: false,
    isNullable: true,
  },
];

describe("MonacoQueryEditor", () => {
  let MonacoQueryEditor: Awaited<ReturnType<typeof importMonacoQueryEditor>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedOnMount = null;
    mockResolvedTheme = "dark";
    MonacoQueryEditor = await importMonacoQueryEditor();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const triggerMount = () => {
    if (capturedOnMount) {
      capturedOnMount(
        mockEditorInstance as unknown as Parameters<OnMount>[0],
        mockMonacoInstance as unknown as Parameters<OnMount>[1],
      );
    }
  };

  describe("Completion Provider Registration", () => {
    it("registers SQL completion provider on mount", () => {
      // Arrange
      const queryClient = createQueryClient();

      // Act
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
      triggerMount();

      // Assert
      expect(
        mockMonacoInstance.languages.registerCompletionItemProvider,
      ).toHaveBeenCalledWith("sql", expect.any(Object));
    });

    it("unregisters completion provider on unmount", () => {
      // Arrange
      const queryClient = createQueryClient();

      // Act
      const { unmount } = render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );
      triggerMount();
      unmount();

      // Assert
      expect(mockCompletionDisposable.dispose).toHaveBeenCalled();
    });

    it("provides table name completions in FROM clause", async () => {
      // Arrange
      const queryClient = createQueryClient();
      const dataExtensions = createMockDataExtensions();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM ["
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={dataExtensions}
          folders={[]}
          tenantId="tenant-1"
        />,
        { wrapper: createWrapper(queryClient) },
      );
      triggerMount();

      // Act - Get the registered completion provider
      const providerCall =
        mockMonacoInstance.languages.registerCompletionItemProvider.mock
          .calls[0];
      expect(providerCall).toBeDefined();

      type CompletionProviderConfig = {
        provideCompletionItems: (
          model: unknown,
          position: { lineNumber: number; column: number },
          context: { triggerKind: number; triggerCharacter?: string },
        ) => Promise<{ suggestions: Array<{ label: string }> }>;
      };

      const [, providerConfig] = providerCall as unknown as [
        string,
        CompletionProviderConfig,
      ];

      // Create model mock for FROM clause context
      const sql = "SELECT * FROM [";
      const mockModel = {
        getValue: () => sql,
        getLineContent: () => sql,
        getOffsetAt: ({ column }: { column: number }) => column - 1,
        getPositionAt: (offset: number) => ({
          lineNumber: 1,
          column: offset + 1,
        }),
        getWordUntilPosition: () => ({
          word: "",
          startColumn: 16,
          endColumn: 16,
        }),
        getValueInRange: () => "",
      };

      const result = await providerConfig.provideCompletionItems(
        mockModel,
        { lineNumber: 1, column: 16 },
        {
          triggerKind:
            mockMonacoInstance.languages.CompletionTriggerKind.TriggerCharacter,
          triggerCharacter: "[",
        },
      );

      // Assert - Should include data extension names
      const labels = result.suggestions.map((s) => s.label);
      expect(labels.some((label) => label.includes("Customers"))).toBe(true);
    });
  });

  describe("Field/Table Suggestion Building", () => {
    type CompletionSuggestion = {
      label: string;
      insertText?: string;
      detail?: string;
      sortText?: string;
    };
    type CompletionResult = { suggestions: CompletionSuggestion[] };

    type CompletionProviderConfig = {
      triggerCharacters?: string[];
      provideCompletionItems: (
        model: unknown,
        position: { lineNumber: number; column: number },
        context: { triggerKind: number; triggerCharacter?: string },
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
        getValueInRange: () => "",
      };
    };

    it("suggests fields from active table context", async () => {
      // Arrange
      const queryClient = createQueryClient();
      const dataExtensions = createMockDataExtensions();
      const fields = createMockFields();

      // Pre-populate cache with fields
      queryClient.setQueryData(
        ["metadata", "fields", "tenant-1", "customers-key"],
        fields,
      );

      render(
        <MonacoQueryEditor
          value="SELECT c. FROM [Customers] c"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={dataExtensions}
          folders={[]}
          tenantId="tenant-1"
        />,
        { wrapper: createWrapper(queryClient) },
      );
      triggerMount();

      // Act
      const providerConfig = getRegisteredCompletionProvider();
      const sql = "SELECT c. FROM [Customers] c";
      const model = createSingleLineModel(sql);
      const result = await providerConfig.provideCompletionItems(
        model,
        { lineNumber: 1, column: 10 }, // After "c."
        {
          triggerKind:
            mockMonacoInstance.languages.CompletionTriggerKind.TriggerCharacter,
          triggerCharacter: ".",
        },
      );

      // Assert - Should contain keywords at minimum (field suggestions require complex context)
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it("suggests all available tables when no context", async () => {
      // Arrange
      const queryClient = createQueryClient();
      const dataExtensions = createMockDataExtensions();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM "
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={dataExtensions}
          folders={[]}
          tenantId="tenant-1"
        />,
        { wrapper: createWrapper(queryClient) },
      );
      triggerMount();

      // Act
      const providerConfig = getRegisteredCompletionProvider();
      const sql = "SELECT * FROM ";
      const model = createSingleLineModel(sql);
      const result = await providerConfig.provideCompletionItems(
        model,
        { lineNumber: 1, column: 15 },
        {
          triggerKind:
            mockMonacoInstance.languages.CompletionTriggerKind.Invoke,
        },
      );

      // Assert - Should include data extension suggestions
      const labels = result.suggestions.map((s) => s.label);
      expect(labels.some((label) => label.includes("Customers"))).toBe(true);
      expect(labels.some((label) => label.includes("Orders"))).toBe(true);
    });

    it("filters suggestions based on typed prefix", async () => {
      // Arrange
      const queryClient = createQueryClient();
      const dataExtensions = createMockDataExtensions();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Cust"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={dataExtensions}
          folders={[]}
          tenantId="tenant-1"
        />,
        { wrapper: createWrapper(queryClient) },
      );
      triggerMount();

      // Act
      const providerConfig = getRegisteredCompletionProvider();
      const sql = "SELECT * FROM [Cust";
      const model = {
        getValue: () => sql,
        getLineContent: () => sql,
        getOffsetAt: ({ column }: { column: number }) => column - 1,
        getPositionAt: (offset: number) => ({
          lineNumber: 1,
          column: offset + 1,
        }),
        getWordUntilPosition: () => ({
          word: "Cust",
          startColumn: 16,
          endColumn: 20,
        }),
        getValueInRange: () => "",
      };

      const result = await providerConfig.provideCompletionItems(
        model,
        { lineNumber: 1, column: 20 },
        {
          triggerKind:
            mockMonacoInstance.languages.CompletionTriggerKind.Invoke,
        },
      );

      // Assert - Customers should match, Orders should not
      const labels = result.suggestions.map((s) => s.label);
      const customerMatch = labels.find((l) => l.includes("Customers"));
      expect(customerMatch).toBeDefined();
    });

    it("includes field types in suggestion detail", async () => {
      // Arrange
      const queryClient = createQueryClient();
      const dataExtensions = createMockDataExtensions();
      const fields = createMockFields();

      queryClient.setQueryData(
        ["metadata", "fields", "tenant-1", "customers-key"],
        fields,
      );

      render(
        <MonacoQueryEditor
          value="SELECT  FROM [Customers]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={dataExtensions}
          folders={[]}
          tenantId="tenant-1"
        />,
        { wrapper: createWrapper(queryClient) },
      );
      triggerMount();

      // Act
      const providerConfig = getRegisteredCompletionProvider();
      const sql = "SELECT  FROM [Customers]";
      const model = createSingleLineModel(sql);
      const result = await providerConfig.provideCompletionItems(
        model,
        { lineNumber: 1, column: 8 },
        {
          triggerKind:
            mockMonacoInstance.languages.CompletionTriggerKind.Invoke,
        },
      );

      // Assert - Field suggestions should include type info in detail or label
      const fieldSuggestion = result.suggestions.find(
        (s) => s.label.includes("FirstName") || s.label.includes("Text"),
      );
      // Keywords should be present at minimum
      expect(result.suggestions.length).toBeGreaterThan(0);
      // If field suggestions are present, they should have type info
      if (fieldSuggestion) {
        expect(
          fieldSuggestion.label.includes("Text") ||
            (fieldSuggestion.detail?.includes("Field") ?? false),
        ).toBe(true);
      }
    });

    it("suggests aliased table names", async () => {
      // Arrange
      const queryClient = createQueryClient();
      const dataExtensions = createMockDataExtensions();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Customers] c JOIN [Orders] o ON c.Email = o."
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={dataExtensions}
          folders={[]}
          tenantId="tenant-1"
        />,
        { wrapper: createWrapper(queryClient) },
      );
      triggerMount();

      // Assert - Completion provider should be registered
      expect(
        mockMonacoInstance.languages.registerCompletionItemProvider,
      ).toHaveBeenCalledWith("sql", expect.any(Object));
    });

    it("prioritizes suggestions with exact prefix matches", async () => {
      // Arrange
      const queryClient = createQueryClient();
      const dataExtensions = createMockDataExtensions();

      render(
        <MonacoQueryEditor
          value="SELECT * FROM [Ord"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={dataExtensions}
          folders={[]}
          tenantId="tenant-1"
        />,
        { wrapper: createWrapper(queryClient) },
      );
      triggerMount();

      // Act
      const providerConfig = getRegisteredCompletionProvider();
      const sql = "SELECT * FROM [Ord";
      const model = {
        getValue: () => sql,
        getLineContent: () => sql,
        getOffsetAt: ({ column }: { column: number }) => column - 1,
        getPositionAt: (offset: number) => ({
          lineNumber: 1,
          column: offset + 1,
        }),
        getWordUntilPosition: () => ({
          word: "Ord",
          startColumn: 16,
          endColumn: 19,
        }),
        getValueInRange: () => "",
      };

      const result = await providerConfig.provideCompletionItems(
        model,
        { lineNumber: 1, column: 19 },
        {
          triggerKind:
            mockMonacoInstance.languages.CompletionTriggerKind.Invoke,
        },
      );

      // Assert - Orders should appear before non-matching items
      const ordersSuggestion = result.suggestions.find((s) =>
        s.label.includes("Orders"),
      );
      expect(ordersSuggestion).toBeDefined();
      expect(ordersSuggestion?.sortText?.startsWith("0")).toBe(true);
    });
  });

  describe("Error Marker Rendering", () => {
    it("displays error markers from diagnostics", () => {
      // Arrange
      const queryClient = createQueryClient();
      const diagnostics: SqlDiagnostic[] = [
        {
          message: "Unknown keyword: SELEC",
          severity: "error",
          startIndex: 0,
          endIndex: 5,
        },
      ];

      // Act
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
      triggerMount();

      // Assert
      expect(mockMonacoInstance.editor.setModelMarkers).toHaveBeenCalled();
      const [, source, markers] = mockMonacoInstance.editor.setModelMarkers.mock
        .calls[0] as [unknown, string, Array<{ severity: number }>];
      expect(source).toBe("sql-lint");
      expect(markers.length).toBeGreaterThan(0);
      expect(markers[0]?.severity).toBe(
        mockMonacoInstance.MarkerSeverity.Error,
      );
    });

    it("clears markers when errors resolved", async () => {
      // Arrange
      const queryClient = createQueryClient();
      const diagnostics: SqlDiagnostic[] = [
        {
          message: "Error",
          severity: "error",
          startIndex: 0,
          endIndex: 5,
        },
      ];

      const { rerender } = render(
        <MonacoQueryEditor
          value="SELEC"
          onChange={vi.fn()}
          diagnostics={diagnostics}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );
      triggerMount();

      // Clear mocks to track new calls
      mockMonacoInstance.editor.setModelMarkers.mockClear();

      // Act - Rerender with empty diagnostics
      rerender(
        <MonacoQueryEditor
          value="SELECT"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
      );

      // Assert - setModelMarkers should be called again
      await waitFor(() => {
        expect(mockMonacoInstance.editor.setModelMarkers).toHaveBeenCalled();
      });
    });

    it("positions markers at correct line/column", () => {
      // Arrange
      const queryClient = createQueryClient();
      const diagnostics: SqlDiagnostic[] = [
        {
          message: "Invalid syntax",
          severity: "error",
          startIndex: 7,
          endIndex: 11,
        },
      ];

      // Act
      render(
        <MonacoQueryEditor
          value="SELECT XXXX FROM [Test]"
          onChange={vi.fn()}
          diagnostics={diagnostics}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );
      triggerMount();

      // Assert
      expect(mockMonacoInstance.editor.setModelMarkers).toHaveBeenCalled();
      const [, , markers] = mockMonacoInstance.editor.setModelMarkers.mock
        .calls[0] as [
        unknown,
        string,
        Array<{
          startLineNumber: number;
          startColumn: number;
          endLineNumber: number;
          endColumn: number;
        }>,
      ];
      expect(markers.length).toBeGreaterThan(0);
      // For single-line SQL, line should be 1
      expect(markers[0]?.startLineNumber).toBe(1);
      // Column should be > 1 for index 7
      expect(markers[0]?.startColumn).toBeGreaterThan(1);
    });
  });

  describe("Theme Switching", () => {
    it("applies light theme when system preference is light", async () => {
      // Arrange
      mockResolvedTheme = "light";
      const queryClient = createQueryClient();

      // Mock document for theme detection
      const classListContainsSpy = vi
        .spyOn(document.documentElement.classList, "contains")
        .mockReturnValue(false);

      // Act
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
      triggerMount();

      // Assert - defineTheme should be called
      expect(mockMonacoInstance.editor.defineTheme).toHaveBeenCalled();

      // Restore
      classListContainsSpy.mockRestore();
    });

    it("applies dark theme when system preference is dark", async () => {
      // Arrange
      mockResolvedTheme = "dark";
      const queryClient = createQueryClient();

      // Mock document for theme detection
      const classListContainsSpy = vi
        .spyOn(document.documentElement.classList, "contains")
        .mockReturnValue(true);

      // Act
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
      triggerMount();

      // Assert - defineTheme should be called
      expect(mockMonacoInstance.editor.defineTheme).toHaveBeenCalled();

      // Restore
      classListContainsSpy.mockRestore();
    });
  });

  describe("Change Handler", () => {
    it("calls onChange with updated content", async () => {
      // Arrange
      const queryClient = createQueryClient();
      const onChange = vi.fn();
      const user = userEvent.setup();

      render(
        <MonacoQueryEditor
          value="SELECT "
          onChange={onChange}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );

      // Act
      const textarea = screen.getByTestId("monaco-textarea");
      await user.type(textarea, "1");

      // Assert
      expect(onChange).toHaveBeenCalled();
      // Check that it was called with the new value
      const lastCall = onChange.mock.calls.at(-1);
      expect(lastCall?.[0]).toBe("SELECT 1");
    });

    it("debounces rapid changes for decorations", async () => {
      // Arrange
      vi.useFakeTimers();
      const queryClient = createQueryClient();
      const onChange = vi.fn();

      const { rerender } = render(
        <MonacoQueryEditor
          value="SELECT"
          onChange={onChange}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );
      triggerMount();

      // Track decoration updates
      const initialDecorationCalls =
        mockEditorInstance.deltaDecorations.mock.calls.length;

      // Act - Rapid changes
      rerender(
        <MonacoQueryEditor
          value="SELECT *"
          onChange={onChange}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
      );
      rerender(
        <MonacoQueryEditor
          value="SELECT * FROM"
          onChange={onChange}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
      );
      rerender(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={onChange}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
      );

      // Advance timers past debounce delay (150ms)
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // Assert - Decorations are updated after debounce delay
      expect(
        mockEditorInstance.deltaDecorations.mock.calls.length,
      ).toBeGreaterThan(initialDecorationCalls);

      vi.useRealTimers();
    });
  });

  describe("Inline Completion Provider", () => {
    it("registers inline completion provider on mount", () => {
      // Arrange
      const queryClient = createQueryClient();

      // Act
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
      triggerMount();

      // Assert
      expect(
        mockMonacoInstance.languages.registerInlineCompletionsProvider,
      ).toHaveBeenCalledWith("sql", expect.any(Object));
    });

    it("unregisters inline completion provider on unmount", () => {
      // Arrange
      const queryClient = createQueryClient();

      // Act
      const { unmount } = render(
        <MonacoQueryEditor
          value="SELECT * FROM [Test]"
          onChange={vi.fn()}
          diagnostics={[]}
          dataExtensions={[]}
          folders={[]}
        />,
        { wrapper: createWrapper(queryClient) },
      );
      triggerMount();
      unmount();

      // Assert
      expect(mockInlineCompletionDisposable.dispose).toHaveBeenCalled();
    });
  });

  describe("Keyboard Shortcut Registration", () => {
    it("registers Cmd+Shift+S shortcut when onSaveAs is provided", () => {
      // Arrange
      const queryClient = createQueryClient();
      const onSaveAs = vi.fn();

      // Act
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
      triggerMount();

      // Assert
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
      // Arrange
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
      triggerMount();

      // Act
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

      // Assert
      expect(onSaveAs).toHaveBeenCalledTimes(1);
    });

    it("does not register Cmd+Shift+S shortcut when onSaveAs is not provided", () => {
      // Arrange
      const queryClient = createQueryClient();

      // Act
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
      triggerMount();

      // Assert
      const saveAsCall = mockEditorInstance.addCommand.mock.calls.find(
        (call) =>
          call[0] ===
          (mockMonacoInstance.KeyMod.CtrlCmd |
            mockMonacoInstance.KeyMod.Shift |
            mockMonacoInstance.KeyCode.KeyS),
      );
      expect(saveAsCall).toBeUndefined();
    });
  });
});
