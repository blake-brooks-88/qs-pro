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
import { MIN_TRIGGER_CHARS } from "@/features/editor-workspace/constants/autocomplete-config";
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
import { getInlineCompletionReplacementEndOffset } from "@/features/editor-workspace/utils/inline-completion-range";
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

const MAX_ERROR_TOKEN_LENGTH = 80;

interface MonacoQueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
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
  const cursorPositionDisposableRef = useRef<Monaco.IDisposable | null>(null);
  const autoBracketRef = useRef(false);
  const onCursorPositionChangeRef = useRef(onCursorPositionChange);
  const diagnosticsRef = useRef(diagnostics);
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
      if (!tenantIdRef.current) return [];
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

  useEffect(() => {
    onCursorPositionChangeRef.current = onCursorPositionChange;
  }, [onCursorPositionChange]);

  useEffect(() => {
    diagnosticsRef.current = diagnostics;
  }, [diagnostics]);

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
      completionDisposableRef.current =
        monacoInstance.languages.registerCompletionItemProvider("sql", {
          triggerCharacters: [".", "[", "_"],
          provideCompletionItems: async (
            model,
            position,
            completionContext,
          ) => {
            const text = model.getValue();
            const cursorIndex = model.getOffsetAt(position);
            const sqlContext = getSqlCursorContext(text, cursorIndex);
            const bracketRange = getBracketReplacementRange(model, position);

            const isExplicitTrigger =
              completionContext.triggerKind ===
              monacoInstance.languages.CompletionTriggerKind.Invoke;

            const textBefore = text.slice(0, cursorIndex);
            const isOnAsterisk =
              /\bSELECT\s+\*$/i.test(textBefore) ||
              /\bSELECT\s+.*,\s*\*$/i.test(textBefore);

            if (isExplicitTrigger && isOnAsterisk) {
              const tablesWithoutAliases = sqlContext.tablesInScope.filter(
                (t) => !t.alias,
              );
              if (tablesWithoutAliases.length > 1) {
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

            const triggerChar = completionContext.triggerCharacter;
            const currentWord = sqlContext.currentWord || "";

            const hasSystemDataViewsLoaded = dataExtensionsRef.current.some(
              (de) =>
                (de.name?.startsWith("_") ?? false) ||
                (de.customerKey?.startsWith("_") ?? false),
            );

            const isImmediateContext =
              triggerChar === "." ||
              triggerChar === "[" ||
              (triggerChar === "_" && hasSystemDataViewsLoaded);

            if (
              !isExplicitTrigger &&
              !isImmediateContext &&
              currentWord.length < MIN_TRIGGER_CHARS
            ) {
              return { suggestions: [] };
            }

            const wordInfo = model.getWordUntilPosition(position);
            const wordRange = new monacoInstance.Range(
              position.lineNumber,
              wordInfo.startColumn,
              position.lineNumber,
              position.column,
            );

            const contextualKeywords = new Set(
              getContextualKeywords(sqlContext.lastKeyword),
            );

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
              const lineContent = model.getLineContent(position.lineNumber);
              const textBeforeCursor = lineContent.slice(
                0,
                position.column - 1,
              );
              const dotIndex = textBeforeCursor.lastIndexOf(".");

              const fieldStartColumn =
                dotIndex >= 0 ? dotIndex + 2 : wordInfo.startColumn;
              const fieldRange = new monacoInstance.Range(
                position.lineNumber,
                fieldStartColumn,
                position.lineNumber,
                position.column,
              );

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
                range: fieldRange,
              }));
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

                  const fieldCount = countResults.at(index);

                  return {
                    label: suggestion.label,
                    insertText,
                    kind: monacoInstance.languages.CompletionItemKind.Struct,
                    detail:
                      fieldCount === null
                        ? "Fields: —"
                        : `Fields: ${fieldCount}`,
                    range,
                    sortText: `0-${suggestion.label}`,
                  };
                });
                const adjustedKeywordSuggestions = keywordSuggestions.map(
                  (keywordSuggestion) => ({
                    ...keywordSuggestion,
                    sortText: `9-${keywordSuggestion.label}`,
                  }),
                );
                return {
                  suggestions: [...suggestions, ...adjustedKeywordSuggestions],
                };
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

            const buildInlineRangeForInsertText = (insertText: string) => {
              const endOffset = getInlineCompletionReplacementEndOffset(
                text,
                cursorIndex,
                insertText,
              );
              const endPosition = model.getPositionAt(endOffset);
              return new monacoInstance.Range(
                position.lineNumber,
                position.column,
                endPosition.lineNumber,
                endPosition.column,
              );
            };

            return {
              items: [
                {
                  insertText: suggestion.text,
                  range: buildInlineRangeForInsertText(suggestion.text),
                },
                ...(suggestion.alternatives || []).map((alt) => ({
                  insertText: alt,
                  range: buildInlineRangeForInsertText(alt),
                })),
              ],
            };
          },
          freeInlineCompletions: () => {},
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
          editorInstance.trigger("keyboard", "type", { text: "[" });
          autoBracketRef.current = false;
        },
      );

      suggestRetriggerDisposableRef.current?.dispose();
      suggestRetriggerDisposableRef.current =
        editorInstance.onDidChangeModelContent((event) => {
          const model = editorInstance.getModel();
          if (!model) return;

          const latestChange = event.changes[event.changes.length - 1];
          if (!latestChange) return;

          const insertedText = latestChange.text;
          if (!insertedText || insertedText.length !== 1) return;
          if (!/[a-zA-Z0-9_]/.test(insertedText)) return;

          const changeEnd = latestChange.rangeOffset + insertedText.length;
          if (changeEnd < 2) return;

          const charBeforeInsert = model.getValue().charAt(changeEnd - 2);
          if (charBeforeInsert !== ".") return;

          editorInstance.trigger(
            "retrigger",
            "editor.action.triggerSuggest",
            {},
          );
        });

      editorInstance.onKeyDown((event) => {
        if (event.keyCode !== monacoInstance.KeyCode.Tab) return;
        if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
          return;
        }

        const model = editorInstance.getModel();
        const position = editorInstance.getPosition();
        if (!model || !position) return;

        const offset = model.getOffsetAt(position);
        const wordInfo = model.getWordUntilPosition(position);
        const currentWord = wordInfo.word ?? "";
        const charBefore = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: Math.max(1, position.column - 1),
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        if (/\s/.test(charBefore)) return;

        const fromJoinMatch = currentWord.match(
          /^(?:f|fr|fro|from|j|jo|joi|join)$/i,
        );
        const isFromOrJoinPrefix =
          wordInfo.endColumn === position.column && fromJoinMatch !== null;
        if (!isFromOrJoinPrefix) return;

        const expandedKeyword = /^f/i.test(currentWord) ? "FROM" : "JOIN";

        const sqlContext = getSqlCursorContext(model.getValue(), offset);
        if (sqlContext.hasFromJoinTable) return;

        event.preventDefault();
        event.stopPropagation();
        autoBracketRef.current = true;
        const replacement = `${expandedKeyword} `;
        editorInstance.executeEdits("auto-bracket-tab", [
          {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: wordInfo.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: wordInfo.endColumn,
            },
            text: replacement,
          },
        ]);
        editorInstance.setPosition({
          lineNumber: position.lineNumber,
          column: wordInfo.startColumn + replacement.length,
        });

        const insertOpenBracket = () => {
          editorInstance.trigger("keyboard", "type", { text: "[" });
        };
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(insertOpenBracket);
        } else {
          setTimeout(insertOpenBracket, 0);
        }

        autoBracketRef.current = false;
      });

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

      cursorPositionDisposableRef.current?.dispose();
      cursorPositionDisposableRef.current =
        editorInstance.onDidChangeCursorPosition((event) => {
          const model = editorInstance.getModel();
          if (!model) return;
          const offset = model.getOffsetAt(event.position);
          onCursorPositionChangeRef.current?.(offset);
        });
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
      suggestRetriggerDisposableRef.current?.dispose();
      cursorPositionDisposableRef.current?.dispose();
      completionDisposableRef.current = null;
      autoBracketDisposableRef.current = null;
      inlineCompletionDisposableRef.current = null;
      suggestRetriggerDisposableRef.current = null;
      cursorPositionDisposableRef.current = null;
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
