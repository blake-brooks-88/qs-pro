import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useQueryClient } from "@tanstack/react-query";
import type {
  DataExtension,
  DataExtensionField,
  Folder,
} from "@/features/editor-workspace/types";
import {
  buildFieldsQueryOptions,
  metadataQueryKeys,
} from "@/features/editor-workspace/hooks/use-metadata";
import {
  applyMonacoTheme,
  getEditorOptions,
  MONACO_THEME_NAME,
} from "@/features/editor-workspace/utils/monaco-options";
import {
  IMMEDIATE_TRIGGER_CHARS,
  MIN_TRIGGER_CHARS,
} from "@/features/editor-workspace/constants/autocomplete-config";
import {
  buildDataExtensionSuggestions,
  buildFieldSuggestions,
  getPrimaryTable,
  resolveTableForAlias,
} from "@/features/editor-workspace/utils/sql-autocomplete";
import {
  extractTableReferences,
  getSharedFolderIds,
  getSqlCursorContext,
  extractSelectFieldRanges,
} from "@/features/editor-workspace/utils/sql-context";
import type { SqlDiagnostic } from "@/features/editor-workspace/utils/sql-diagnostics";
import { toMonacoMarkers } from "@/features/editor-workspace/utils/sql-diagnostics";
import { getContextualKeywords } from "@/features/editor-workspace/utils/autocomplete-keyword";
import { evaluateInlineSuggestions } from "@/features/editor-workspace/utils/inline-suggestions";
import type { InlineSuggestionContext } from "@/features/editor-workspace/utils/inline-suggestions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

const SQL_KEYWORDS = [
  "SELECT",
  "FROM",
  "WHERE",
  "JOIN",
  "INNER",
  "LEFT",
  "RIGHT",
  "FULL",
  "OUTER",
  "CROSS",
  "ON",
  "UNION",
  "UNION ALL",
  "GROUP BY",
  "ORDER BY",
  "HAVING",
  "LIMIT",
  "DISTINCT",
  "TOP",
  "ASC",
  "DESC",
  "AS",
  "AND",
  "OR",
  "NOT",
  "IN",
  "EXISTS",
  "IS",
  "NULL",
  "BETWEEN",
  "LIKE",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
];

const MAX_DE_SUGGESTIONS = 50;
const MAX_DE_COUNT_FETCH = 10;

interface MonacoQueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  onRunRequest?: () => void;
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
  onRunRequest,
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
  const autoBracketRef = useRef(false);
  const queryClient = useQueryClient();

  // Debounce the value to prevent excessive decoration updates during rapid typing
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
      if (!tenantIdRef.current) return [];
      try {
        const options = buildFieldsQueryOptions(
          tenantIdRef.current,
          customerKey,
        );
        // Check if aborted before making the request
        if (signal?.aborted) {
          return [];
        }
        const result = await queryClient.fetchQuery(options);
        // Check if aborted after request completes
        if (signal?.aborted) {
          return [];
        }
        return result;
      } catch {
        // Return empty array if aborted or if there's an error
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
      if (!tenantIdRef.current) return null;
      const cached = queryClient.getQueryData<DataExtensionField[]>(
        metadataQueryKeys.fields(tenantIdRef.current, customerKey),
      );
      if (cached) return cached.length;
      if (!shouldFetch) return null;
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

  const handleEditorMount: OnMount = useCallback(
    (editorInstance, monacoInstance) => {
      editorRef.current = editorInstance;
      monacoRef.current = monacoInstance;

      // Focus the editor so user can start typing immediately
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
      completionDisposableRef.current =
        monacoInstance.languages.registerCompletionItemProvider("sql", {
          triggerCharacters: [".", "["],
          provideCompletionItems: async (
            model,
            position,
            completionContext,
          ) => {
            const text = model.getValue();
            const cursorIndex = model.getOffsetAt(position);
            const sqlContext = getSqlCursorContext(text, cursorIndex);
            const bracketRange = getBracketReplacementRange(model, position);

            // Check if this is an explicit trigger (Ctrl+Space)
            const isExplicitTrigger =
              completionContext.triggerKind ===
              monacoInstance.languages.CompletionTriggerKind.Invoke;

            // Check if cursor is on asterisk in SELECT clause
            const textBefore = text.slice(0, cursorIndex);
            const isOnAsterisk =
              /\bSELECT\s+\*$/i.test(textBefore) ||
              /\bSELECT\s+.*,\s*\*$/i.test(textBefore);

            // Handle asterisk expansion when explicitly triggered
            if (isExplicitTrigger && isOnAsterisk) {
              // Check for ambiguity: multiple tables without aliases
              const tablesWithoutAliases = sqlContext.tablesInScope.filter(
                (t) => !t.alias,
              );
              if (tablesWithoutAliases.length > 1) {
                // Return error as a special completion item
                const wordInfo = model.getWordUntilPosition(position);
                const wordRange = new monacoInstance.Range(
                  position.lineNumber,
                  wordInfo.startColumn,
                  position.lineNumber,
                  position.column,
                );

                return {
                  suggestions: [
                    {
                      label:
                        "⚠️ Cannot expand: multiple tables without aliases",
                      kind: monacoInstance.languages.CompletionItemKind.Issue,
                      insertText: "*",
                      detail: "Add table aliases to disambiguate columns",
                      sortText: "0000",
                      range: wordRange,
                    },
                  ],
                };
              }

              // Build column expansion
              const columnList: string[] = [];

              for (const table of sqlContext.tablesInScope) {
                let fields: DataExtensionField[] = [];

                if (table.isSubquery) {
                  fields = table.outputFields.map((name) => ({
                    name,
                    type: "Text" as const,
                    isPrimaryKey: false,
                    isNullable: true,
                  }));
                } else if (tenantIdRef.current) {
                  const dataExtension = resolveDataExtension(table.name);
                  const customerKey = dataExtension?.customerKey ?? table.name;
                  fields = await fetchFields(customerKey);
                }

                const prefix = table.alias || "";

                for (const field of fields) {
                  const fieldName = field.name.includes(" ")
                    ? `[${field.name}]`
                    : field.name;

                  const fullName = prefix
                    ? `${prefix}.${fieldName}`
                    : fieldName;

                  columnList.push(fullName);
                }
              }

              if (columnList.length > 0) {
                const expandedColumns = columnList.join(",\n  ");

                // Find the asterisk position to replace it
                const asteriskMatch = textBefore.match(/\*$/);
                if (asteriskMatch) {
                  const asteriskOffset = textBefore.length - 1;
                  const asteriskPos = model.getPositionAt(asteriskOffset);
                  const replaceRange = new monacoInstance.Range(
                    asteriskPos.lineNumber,
                    asteriskPos.column,
                    position.lineNumber,
                    position.column,
                  );

                  return {
                    suggestions: [
                      {
                        label: `Expand to ${columnList.length} columns`,
                        kind: monacoInstance.languages.CompletionItemKind
                          .Snippet,
                        insertText: expandedColumns,
                        detail: "Expand * to full column list",
                        documentation: expandedColumns,
                        range: replaceRange,
                        sortText: "0000",
                      },
                    ],
                  };
                }
              }
            }

            // Get the character that triggered completion
            const triggerChar = completionContext.triggerCharacter;
            const currentWord = sqlContext.currentWord || "";

            // For immediate trigger chars (. [ _), allow 1-char minimum
            const isImmediateContext =
              triggerChar &&
              IMMEDIATE_TRIGGER_CHARS.includes(triggerChar as never);

            // For general typing, require 2+ chars
            if (!isImmediateContext && currentWord.length < MIN_TRIGGER_CHARS) {
              return { suggestions: [] };
            }

            // Compute word range for suggestions - Monaco uses this to replace the current word
            const wordInfo = model.getWordUntilPosition(position);
            const wordRange = new monacoInstance.Range(
              position.lineNumber,
              wordInfo.startColumn,
              position.lineNumber,
              position.column,
            );

            // Get contextual keywords for prioritization
            const contextualKeywords = new Set(
              getContextualKeywords(sqlContext.lastKeyword),
            );

            // Build keyword suggestions with sortText prioritization
            // Note: We don't filter by currentWord here - Monaco handles that internally
            // This ensures keywords are always available as fallback suggestions
            const keywordsWithBrackets = new Set(["FROM", "JOIN"]);
            const keywordSuggestions = SQL_KEYWORDS.map((keyword) => {
              const needsBrackets = keywordsWithBrackets.has(keyword);
              return {
                label: keyword,
                insertText: needsBrackets ? `${keyword} [$0]` : keyword,
                insertTextRules: needsBrackets
                  ? monacoInstance.languages.CompletionItemInsertTextRule
                      .InsertAsSnippet
                  : undefined,
                kind: monacoInstance.languages.CompletionItemKind.Keyword,
                sortText: contextualKeywords.has(keyword)
                  ? `0-${keyword}`
                  : `1-${keyword}`,
                range: wordRange,
              };
            });

            if (sqlContext.aliasBeforeDot) {
              const table = resolveTableForAlias(
                sqlContext.aliasBeforeDot,
                sqlContext.tablesInScope,
              );
              if (!table) return { suggestions: [] };

              let fields: DataExtensionField[] = [];
              const ownerLabel = table.isSubquery
                ? (table.alias ?? "Subquery")
                : (resolveDataExtension(table.name)?.name ??
                  table.qualifiedName);
              if (table.isSubquery) {
                fields = table.outputFields.map((name) => ({
                  name,
                  type: "Text" as const,
                  isPrimaryKey: false,
                  isNullable: true,
                }));
              } else if (tenantIdRef.current) {
                const dataExtension = resolveDataExtension(table.name);
                const customerKey = dataExtension?.customerKey ?? table.name;
                fields = await fetchFields(customerKey);
              }

              const suggestions = buildFieldSuggestions(fields, {
                ownerLabel,
              }).map((suggestion) => ({
                label: suggestion.label,
                insertText: suggestion.insertText,
                detail: suggestion.detail,
                kind: monacoInstance.languages.CompletionItemKind.Field,
                sortText: suggestion.label,
                range: wordRange,
              }));
              // Only return field suggestions when completing after alias.
              return { suggestions };
            }

            if (sqlContext.isAfterFromJoin) {
              const shouldSuggestTables =
                !sqlContext.hasFromJoinTable ||
                sqlContext.cursorInFromJoinTable ||
                bracketRange.inBracket;
              if (shouldSuggestTables) {
                const suggestionsBase = buildDataExtensionSuggestions(
                  dataExtensionsRef.current,
                  sharedFolderIdsRef.current,
                  sqlContext.currentWord,
                  MAX_DE_SUGGESTIONS,
                );
                const countResults = await Promise.all(
                  suggestionsBase.map((suggestion, index) =>
                    getFieldsCount(
                      suggestion.customerKey,
                      index < MAX_DE_COUNT_FETCH,
                    ),
                  ),
                );

                const suggestions = suggestionsBase.map((suggestion, index) => {
                  const replaceOffsets =
                    bracketRange.inBracket && suggestion.isShared
                      ? {
                          startOffset: bracketRange.startOffset - 1,
                          endOffset: bracketRange.hasClosingBracket
                            ? bracketRange.endOffset + 1
                            : bracketRange.endOffset,
                        }
                      : bracketRange;
                  const insertText = bracketRange.inBracket
                    ? suggestion.isShared
                      ? `ENT.[${suggestion.name}]`
                      : suggestion.name
                    : suggestion.insertText;
                  const range = bracketRange.inBracket
                    ? (() => {
                        const startPos = model.getPositionAt(
                          replaceOffsets.startOffset,
                        );
                        const endPos = model.getPositionAt(
                          replaceOffsets.endOffset,
                        );
                        return new monacoInstance.Range(
                          startPos.lineNumber,
                          startPos.column,
                          endPos.lineNumber,
                          endPos.column,
                        );
                      })()
                    : wordRange;

                  return {
                    label: suggestion.label,
                    insertText,
                    kind: monacoInstance.languages.CompletionItemKind.Struct,
                    detail:
                      countResults[index] === null
                        ? "Fields: —"
                        : `Fields: ${countResults[index]}`,
                    range,
                    sortText: `2-${suggestion.label}`,
                  };
                });
                return { suggestions: [...suggestions, ...keywordSuggestions] };
              }
            }

            if (sqlContext.isAfterSelect) {
              const primaryTable = getPrimaryTable(sqlContext.tablesInScope);
              if (!primaryTable) return { suggestions: keywordSuggestions };

              let fields: DataExtensionField[] = [];
              const ownerLabel = primaryTable.isSubquery
                ? (primaryTable.alias ?? "Subquery")
                : (resolveDataExtension(primaryTable.name)?.name ??
                  primaryTable.qualifiedName);
              const aliasPrefix = primaryTable.alias ?? undefined;
              if (primaryTable.isSubquery) {
                fields = primaryTable.outputFields.map((name) => ({
                  name,
                  type: "Text",
                  isPrimaryKey: false,
                  isNullable: true,
                }));
              } else if (tenantIdRef.current) {
                const dataExtension = resolveDataExtension(primaryTable.name);
                const customerKey =
                  dataExtension?.customerKey ?? primaryTable.name;
                fields = await fetchFields(customerKey);
              }

              const suggestions = buildFieldSuggestions(fields, {
                prefix: aliasPrefix,
                ownerLabel,
              }).map((suggestion) => ({
                label: suggestion.label,
                insertText: suggestion.insertText,
                detail: suggestion.detail,
                kind: monacoInstance.languages.CompletionItemKind.Field,
                sortText: `2-${suggestion.label}`,
                range: wordRange,
              }));
              return {
                suggestions: [...suggestions, ...keywordSuggestions],
              };
            }

            // Fallback: return all keywords - Monaco only calls this when triggered
            // and handles filtering suggestions to match what the user typed
            return { suggestions: keywordSuggestions };
          },
        });

      inlineCompletionDisposableRef.current?.dispose();
      inlineCompletionDisposableRef.current =
        monacoInstance.languages.registerInlineCompletionsProvider("sql", {
          provideInlineCompletions: async (model, position) => {
            const text = model.getValue();
            const cursorIndex = model.getOffsetAt(position);
            const sqlContext = getSqlCursorContext(text, cursorIndex);

            const ctx: InlineSuggestionContext = {
              sql: text,
              cursorIndex,
              sqlContext,
              tablesInScope: sqlContext.tablesInScope,
              existingAliases: new Set(
                sqlContext.tablesInScope
                  .map((t) => t.alias?.toLowerCase())
                  .filter((a): a is string => Boolean(a)),
              ),
              getFieldsForTable: async (table) => {
                if (table.isSubquery) {
                  return table.outputFields.map((name) => ({
                    name,
                    type: "Text" as const,
                    isPrimaryKey: false,
                    isNullable: true,
                  }));
                }
                const dataExtension = resolveDataExtension(table.name);
                const customerKey = dataExtension?.customerKey ?? table.name;
                return fetchFields(customerKey);
              },
            };

            const suggestion = await evaluateInlineSuggestions(ctx);

            if (!suggestion) {
              return { items: [] };
            }

            return {
              items: [
                {
                  insertText: suggestion.text,
                  range: new monacoInstance.Range(
                    position.lineNumber,
                    position.column,
                    position.lineNumber,
                    position.column,
                  ),
                },
                // Include alternatives if available
                ...(suggestion.alternatives || []).map((alt) => ({
                  insertText: alt,
                  range: new monacoInstance.Range(
                    position.lineNumber,
                    position.column,
                    position.lineNumber,
                    position.column,
                  ),
                })),
              ],
            };
          },
          freeInlineCompletions: () => {},
          // Monaco 0.52+ may call this instead of freeInlineCompletions
          disposeInlineCompletions: () => {},
        } as Parameters<
          typeof monacoInstance.languages.registerInlineCompletionsProvider
        >[1]);

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
          // After SELECT/FROM/WHERE/JOIN - indent next line
          {
            beforeText:
              /^\s*(SELECT|FROM|WHERE|AND|OR|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|FULL\s+JOIN|GROUP\s+BY|ORDER\s+BY|HAVING)\b.*$/i,
            action: {
              indentAction: monacoInstance.languages.IndentAction.Indent,
            },
          },
          // Before major clauses - outdent to match SELECT level
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
      autoBracketDisposableRef.current = editorInstance.onDidChangeModelContent(
        (event) => {
          if (autoBracketRef.current) return;
          const model = editorInstance.getModel();
          if (!model) return;

          const latestChange = event.changes[event.changes.length - 1];
          if (!latestChange) return;
          if (!latestChange.text) return;

          const changeEnd = latestChange.rangeOffset + latestChange.text.length;
          const prefixStart = Math.max(0, changeEnd - 7);
          const prefix = model
            .getValue()
            .slice(prefixStart, changeEnd)
            .toLowerCase();
          const shouldInsert = /\b(from|join)\s$/.test(prefix);

          if (!shouldInsert) return;

          const position = model.getPositionAt(changeEnd);
          const nextChar = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column + 1,
          });

          if (nextChar.startsWith("[")) return;

          autoBracketRef.current = true;
          editorInstance.executeEdits("auto-bracket", [
            {
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
              text: "[]",
            },
          ]);
          editorInstance.setPosition({
            lineNumber: position.lineNumber,
            column: position.column + 1,
          });
          autoBracketRef.current = false;
        },
      );

      if (onSave) {
        editorInstance.addCommand(
          monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
          () => {
            onSave();
          },
        );
      }

      if (onRunRequest) {
        editorInstance.addCommand(
          monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter,
          () => {
            onRunRequest();
          },
        );
      }

      editorInstance.addCommand(
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Slash,
        () => {
          editorInstance.getAction("editor.action.commentLine")?.run();
        },
      );
    },
    [
      diagnostics,
      fetchFields,
      getFieldsCount,
      getBracketReplacementRange,
      onRunRequest,
      onSave,
      resolveDataExtension,
    ],
  );

  useEffect(() => {
    return () => {
      completionDisposableRef.current?.dispose();
      autoBracketDisposableRef.current?.dispose();
      inlineCompletionDisposableRef.current?.dispose();
      completionDisposableRef.current = null;
      autoBracketDisposableRef.current = null;
      inlineCompletionDisposableRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    monaco.editor.setModelMarkers(
      model,
      "sql-lint",
      toMonacoMarkers(diagnostics, model.getValue(), monaco),
    );
  }, [diagnostics, value]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const model = editor.getModel();
    if (!model) return;

    const references = extractTableReferences(model.getValue()).filter(
      (reference) => !reference.isSubquery,
    );

    const decorations = references.map((reference) => {
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

    decorationRef.current = editor.deltaDecorations(decorationRef.current, [
      ...decorations,
      ...fieldDecorations,
    ]);
  }, [debouncedValue]);

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
