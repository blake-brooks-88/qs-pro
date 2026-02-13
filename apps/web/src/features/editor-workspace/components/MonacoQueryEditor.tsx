import Editor, { type OnMount } from "@monaco-editor/react";
import { useQueryClient } from "@tanstack/react-query";
import type * as Monaco from "monaco-editor";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  buildFieldsQueryOptions,
  metadataQueryKeys,
} from "@/features/editor-workspace/hooks/use-metadata";
import type {
  DataExtension,
  DataExtensionField,
  Folder,
} from "@/features/editor-workspace/types";
import {
  applyMonacoTheme,
  getEditorOptions,
  MONACO_THEME_NAME,
} from "@/features/editor-workspace/utils/monaco-options";
import {
  extractSelectFieldRanges,
  extractTableReferences,
  getSharedFolderIds,
} from "@/features/editor-workspace/utils/sql-context";
import type { SqlDiagnostic } from "@/features/editor-workspace/utils/sql-diagnostics";
import { toMonacoMarkers } from "@/features/editor-workspace/utils/sql-diagnostics";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

import {
  registerSqlAutoBracketInsertOnFromJoin,
  registerSqlSuggestRetriggerOnDot,
  registerSqlTabExpandFromJoin,
} from "./monaco/register-sql-auto-bracket-behavior";
import { registerSqlCompletionProvider } from "./monaco/register-sql-completion-provider";
import {
  registerCursorPositionListener,
  registerSqlEditorKeybindings,
} from "./monaco/register-sql-editor-keybindings";
import { registerSqlInlineCompletionsProvider } from "./monaco/register-sql-inline-completions-provider";

const MAX_ERROR_TOKEN_LENGTH = 80;

interface MonacoQueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onRunRequest?: () => void;
  onCursorPositionChange?: (position: number) => void;
  diagnostics: SqlDiagnostic[];
  dataExtensions: DataExtension[];
  folders: Folder[];
  tenantId?: string | null;
  className?: string;
}

export function MonacoQueryEditor({
  value,
  onChange,
  onSave,
  onSaveAs,
  onRunRequest,
  onCursorPositionChange,
  diagnostics,
  dataExtensions,
  folders,
  tenantId,
  className,
}: MonacoQueryEditorProps) {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationRef = useRef<string[]>([]);
  const completionDisposableRef = useRef<Monaco.IDisposable | null>(null);
  const autoBracketDisposableRef = useRef<Monaco.IDisposable | null>(null);
  const inlineCompletionDisposableRef = useRef<Monaco.IDisposable | null>(null);
  const suggestRetriggerDisposableRef = useRef<Monaco.IDisposable | null>(null);
  const tabExpandDisposableRef = useRef<Monaco.IDisposable | null>(null);
  const cursorPositionDisposableRef = useRef<Monaco.IDisposable | null>(null);
  const autoBracketRef = useRef(false);
  const onCursorPositionChangeRef = useRef(onCursorPositionChange);
  const diagnosticsRef = useRef(diagnostics);
  const onSaveRef = useRef(onSave);
  const onSaveAsRef = useRef(onSaveAs);
  const onRunRequestRef = useRef(onRunRequest);
  const queryClient = useQueryClient();

  const debouncedValue = useDebouncedValue(value, 150);

  const sharedFolderIds = useMemo(() => getSharedFolderIds(folders), [folders]);
  const dataExtensionsRef = useRef<DataExtension[]>(dataExtensions);
  const sharedFolderIdsRef = useRef<Set<string>>(sharedFolderIds);
  const tenantIdRef = useRef<string | null | undefined>(tenantId);

  const resolveDataExtension = useCallback((name: string) => {
    const normalized = name.toLowerCase();
    return dataExtensionsRef.current.find(
      (de) =>
        de.name.toLowerCase() === normalized ||
        de.customerKey.toLowerCase() === normalized,
    );
  }, []);

  const fetchFields = useCallback(
    async (customerKey: string, signal?: AbortSignal) => {
      if (!tenantIdRef.current) {
        return [];
      }
      try {
        const options = buildFieldsQueryOptions(
          tenantIdRef.current,
          customerKey,
        );
        if (signal?.aborted) {
          return [];
        }
        const result = await queryClient.fetchQuery(options);
        if (signal?.aborted) {
          return [];
        }
        return result;
      } catch {
        if (signal?.aborted) {
          return [];
        }
        return [];
      }
    },
    [queryClient],
  );

  const getFieldsCount = useCallback(
    async (customerKey: string, shouldFetch: boolean) => {
      if (!tenantIdRef.current) {
        return null;
      }
      const cached = queryClient.getQueryData<DataExtensionField[]>(
        metadataQueryKeys.fields(tenantIdRef.current, customerKey),
      );
      if (cached) {
        return cached.length;
      }
      if (!shouldFetch) {
        return null;
      }
      const fields = await fetchFields(customerKey);
      return fields.length;
    },
    [fetchFields, queryClient],
  );

  const getBracketReplacementRange = useCallback(
    (model: Monaco.editor.ITextModel, position: Monaco.Position) => {
      const offset = model.getOffsetAt(position);
      const line = model.getLineContent(position.lineNumber);
      const lineOffset = model.getOffsetAt({
        lineNumber: position.lineNumber,
        column: 1,
      });
      const cursorInLine = position.column - 1;
      const leftIndex = line.lastIndexOf("[", cursorInLine);
      const rightIndex = line.indexOf("]", cursorInLine);

      if (leftIndex !== -1) {
        const start = lineOffset + leftIndex + 1;
        if (rightIndex !== -1 && rightIndex >= cursorInLine) {
          const end = lineOffset + rightIndex;
          if (start <= offset && offset <= end) {
            return {
              startOffset: start,
              endOffset: end,
              inBracket: true,
              hasClosingBracket: true,
            };
          }
        }

        if (rightIndex === -1 && start <= offset) {
          return {
            startOffset: start,
            endOffset: offset,
            inBracket: true,
            hasClosingBracket: false,
          };
        }
      }

      return {
        startOffset: offset,
        endOffset: offset,
        inBracket: false,
        hasClosingBracket: false,
      };
    },
    [],
  );

  useEffect(() => {
    dataExtensionsRef.current = dataExtensions;
  }, [dataExtensions]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const monaco = monacoRef.current;
      if (monaco) {
        applyMonacoTheme(monaco);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [resolvedTheme]);

  useEffect(() => {
    sharedFolderIdsRef.current = sharedFolderIds;
  }, [sharedFolderIds]);

  useEffect(() => {
    tenantIdRef.current = tenantId;
  }, [tenantId]);

  useEffect(() => {
    onCursorPositionChangeRef.current = onCursorPositionChange;
  }, [onCursorPositionChange]);

  useEffect(() => {
    diagnosticsRef.current = diagnostics;
  }, [diagnostics]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    onSaveAsRef.current = onSaveAs;
  }, [onSaveAs]);

  useEffect(() => {
    onRunRequestRef.current = onRunRequest;
  }, [onRunRequest]);

  const handleEditorMount: OnMount = useCallback(
    (editorInstance, monacoInstance) => {
      editorRef.current = editorInstance;
      monacoRef.current = monacoInstance;

      editorInstance.focus();

      applyMonacoTheme(monacoInstance);

      const model = editorInstance.getModel();
      if (model) {
        monacoInstance.editor.setModelMarkers(
          model,
          "sql-lint",
          toMonacoMarkers(diagnostics, model.getValue(), monacoInstance),
        );
      }

      completionDisposableRef.current?.dispose();
      completionDisposableRef.current = registerSqlCompletionProvider({
        monaco: monacoInstance,
        resolveDataExtension,
        fetchFields,
        getFieldsCount,
        hasTenant: () => Boolean(tenantIdRef.current),
        getDataExtensions: () => dataExtensionsRef.current,
        getSharedFolderIds: () => sharedFolderIdsRef.current,
        getBracketReplacementRange,
      });

      inlineCompletionDisposableRef.current?.dispose();
      inlineCompletionDisposableRef.current =
        registerSqlInlineCompletionsProvider({
          monaco: monacoInstance,
          resolveDataExtension,
          fetchFields,
        });

      monacoInstance.languages.setLanguageConfiguration("sql", {
        comments: {
          lineComment: "--",
          blockComment: ["/*", "*/"],
        },
        autoClosingPairs: [
          { open: "[", close: "]" },
          { open: "(", close: ")" },
          { open: "{", close: "}" },
          { open: "'", close: "'" },
          { open: '"', close: '"' },
          { open: "/*", close: "*/" },
        ],
        onEnterRules: [
          {
            // eslint-disable-next-line security/detect-unsafe-regex -- Monaco requires a RegExp here; this pattern is fully anchored and avoids nested quantifiers/backtracking hotspots, so it's safe for untrusted input.
            beforeText: /^\s*SELECT(?:\s+DISTINCT)?(?:\s+TOP\s+\d+)?\s*$/i,
            action: {
              indentAction: monacoInstance.languages.IndentAction.Indent,
            },
          },
          {
            beforeText: /^\s*(FROM|WHERE|JOIN|ON|HAVING)\s*$/i,
            action: {
              indentAction: monacoInstance.languages.IndentAction.Indent,
            },
          },
          {
            beforeText: /^\s*(GROUP\s+BY|ORDER\s+BY)\s*$/i,
            action: {
              indentAction: monacoInstance.languages.IndentAction.Indent,
            },
          },
          {
            beforeText:
              // eslint-disable-next-line security/detect-unsafe-regex -- Monaco requires a RegExp here; this pattern is fully anchored and avoids nested quantifiers/backtracking hotspots, so it's safe for untrusted input.
              /^\s*(?:(?:INNER|LEFT|RIGHT|FULL)(?:\s+OUTER)?|CROSS)?\s*JOIN\s+\S+(?:\s+(?:AS\s+)?(?!ON\b)\S+)?\s*$/i,
            action: {
              indentAction: monacoInstance.languages.IndentAction.Indent,
            },
          },
          {
            beforeText: /^\s*$/,
            afterText: /^\s*(FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING)\b/i,
            action: {
              indentAction: monacoInstance.languages.IndentAction.Outdent,
            },
          },
        ],
        indentationRules: {
          increaseIndentPattern: /^\s*(SELECT|FROM|WHERE|CASE)\b/i,
          decreaseIndentPattern: /^\s*(END|FROM|WHERE|GROUP|ORDER)\b/i,
        },
      });

      autoBracketDisposableRef.current?.dispose();
      autoBracketDisposableRef.current = registerSqlAutoBracketInsertOnFromJoin(
        {
          editor: editorInstance,
          autoBracketRef,
        },
      );

      suggestRetriggerDisposableRef.current?.dispose();
      suggestRetriggerDisposableRef.current = registerSqlSuggestRetriggerOnDot({
        editor: editorInstance,
      });

      tabExpandDisposableRef.current?.dispose();
      tabExpandDisposableRef.current = registerSqlTabExpandFromJoin({
        editor: editorInstance,
        monaco: monacoInstance,
        autoBracketRef,
      });

      registerSqlEditorKeybindings({
        editor: editorInstance,
        monaco: monacoInstance,
        getOnSave: () => onSaveRef.current,
        getOnSaveAs: () => onSaveAsRef.current,
        enableSaveAs: Boolean(onSaveAs),
        enableRunRequest: Boolean(onRunRequest),
        getOnRunRequest: () => onRunRequestRef.current,
      });

      cursorPositionDisposableRef.current?.dispose();
      cursorPositionDisposableRef.current = registerCursorPositionListener({
        editor: editorInstance,
        onCursorPositionChange: (offset) => {
          onCursorPositionChangeRef.current?.(offset);
        },
      });
    },
    [
      diagnostics,
      fetchFields,
      getFieldsCount,
      getBracketReplacementRange,
      onRunRequest,
      onSaveAs,
      resolveDataExtension,
    ],
  );

  useEffect(() => {
    return () => {
      completionDisposableRef.current?.dispose();
      autoBracketDisposableRef.current?.dispose();
      inlineCompletionDisposableRef.current?.dispose();
      suggestRetriggerDisposableRef.current?.dispose();
      tabExpandDisposableRef.current?.dispose();
      cursorPositionDisposableRef.current?.dispose();
      completionDisposableRef.current = null;
      autoBracketDisposableRef.current = null;
      inlineCompletionDisposableRef.current = null;
      suggestRetriggerDisposableRef.current = null;
      tabExpandDisposableRef.current = null;
      cursorPositionDisposableRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) {
      return;
    }
    const model = editor.getModel();
    if (!model) {
      return;
    }

    monaco.editor.setModelMarkers(
      model,
      "sql-lint",
      toMonacoMarkers(diagnostics, model.getValue(), monaco),
    );
  }, [diagnostics, value]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) {
      return;
    }

    const model = editor.getModel();
    if (!model) {
      return;
    }

    const references = extractTableReferences(model.getValue()).filter(
      (reference) => !reference.isSubquery,
    );

    const tableDecorations = references.map((reference) => {
      const start = model.getPositionAt(reference.startIndex);
      const end = model.getPositionAt(reference.endIndex);
      return {
        range: new monaco.Range(
          start.lineNumber,
          start.column,
          end.lineNumber,
          end.column,
        ),
        options: {
          inlineClassName: "monaco-de-name",
        },
      };
    });

    const fieldRanges = extractSelectFieldRanges(model.getValue());
    const fieldDecorations = fieldRanges.map((range) => {
      const start = model.getPositionAt(range.startIndex);
      const end = model.getPositionAt(range.endIndex);
      return {
        range: new monaco.Range(
          start.lineNumber,
          start.column,
          end.lineNumber,
          end.column,
        ),
        options: {
          inlineClassName:
            range.type === "field" ? "monaco-field-name" : "monaco-field-alias",
        },
      };
    });

    const errorTokenDecorations = diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .filter(
        (diagnostic) =>
          diagnostic.endIndex - diagnostic.startIndex <= MAX_ERROR_TOKEN_LENGTH,
      )
      .map((diagnostic) => {
        const start = model.getPositionAt(diagnostic.startIndex);
        const end = model.getPositionAt(
          Math.max(diagnostic.endIndex, diagnostic.startIndex + 1),
        );
        return {
          range: new monaco.Range(
            start.lineNumber,
            start.column,
            end.lineNumber,
            end.column,
          ),
          options: {
            inlineClassName: "monaco-error-token",
          },
        };
      });

    decorationRef.current = editor.deltaDecorations(decorationRef.current, [
      ...tableDecorations,
      ...fieldDecorations,
      ...errorTokenDecorations,
    ]);
  }, [debouncedValue, diagnostics]);

  return (
    <div className={cn("h-full w-full", className)}>
      <Editor
        height="100%"
        defaultLanguage="sql"
        theme={MONACO_THEME_NAME}
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        onMount={handleEditorMount}
        options={getEditorOptions()}
      />
    </div>
  );
}
