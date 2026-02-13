import type * as Monaco from "monaco-editor";

import { MIN_TRIGGER_CHARS } from "@/features/editor-workspace/constants/autocomplete-config";
import type {
  DataExtension,
  DataExtensionField,
} from "@/features/editor-workspace/types";
import {
  buildDataExtensionSuggestions,
  buildFieldSuggestions,
  getPrimaryTable,
  resolveTableForAlias,
} from "@/features/editor-workspace/utils/sql-autocomplete";
import {
  getSqlCursorContext,
  isInsideComment,
  isInsideString,
} from "@/features/editor-workspace/utils/sql-context";

import { buildAsteriskExpansion } from "./build-asterisk-expansion";
import { buildSqlKeywordCompletions } from "./build-sql-keyword-completions";

const MAX_DE_SUGGESTIONS = 50;
const MAX_DE_COUNT_FETCH = 10;

export interface BracketReplacementRange {
  startOffset: number;
  endOffset: number;
  inBracket: boolean;
  hasClosingBracket: boolean;
}

export function registerSqlCompletionProvider(options: {
  monaco: typeof Monaco;
  resolveDataExtension: (name: string) => DataExtension | undefined;
  fetchFields: (
    customerKey: string,
    signal?: AbortSignal,
  ) => Promise<DataExtensionField[]>;
  getFieldsCount: (
    customerKey: string,
    shouldFetch: boolean,
  ) => Promise<number | null>;
  hasTenant: () => boolean;
  getDataExtensions: () => DataExtension[];
  getSharedFolderIds: () => Set<string>;
  getBracketReplacementRange: (
    model: Monaco.editor.ITextModel,
    position: Monaco.Position,
  ) => BracketReplacementRange;
}): Monaco.IDisposable {
  const {
    monaco,
    resolveDataExtension,
    fetchFields,
    getFieldsCount,
    hasTenant,
    getDataExtensions,
    getSharedFolderIds,
    getBracketReplacementRange,
  } = options;

  return monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: [".", "[", "_"],
    provideCompletionItems: async (model, position, completionContext) => {
      const text = model.getValue();
      const cursorIndex = model.getOffsetAt(position);
      const sqlContext = getSqlCursorContext(text, cursorIndex);
      const bracketRange = getBracketReplacementRange(model, position);

      if (
        isInsideString(text, cursorIndex) ||
        isInsideComment(text, cursorIndex)
      ) {
        return { suggestions: [] };
      }

      const isExplicitTrigger =
        completionContext.triggerKind ===
        monaco.languages.CompletionTriggerKind.Invoke;

      const textBefore = text.slice(0, cursorIndex);
      const isOnAsterisk =
        /\bSELECT\s+\*$/i.test(textBefore) ||
        /\bSELECT\s+.*,\s*\*$/i.test(textBefore);

      if (isExplicitTrigger && isOnAsterisk) {
        const result = await buildAsteriskExpansion({
          textBeforeCursor: textBefore,
          cursorIndex,
          tablesInScope: sqlContext.tablesInScope.map((table) => ({
            name: table.name,
            alias: table.alias,
            isSubquery: table.isSubquery,
            outputFields: table.outputFields,
          })),
          getFieldsForTable: async (table) => {
            if (table.isSubquery) {
              return table.outputFields.map((name) => ({
                name,
                type: "Text" as const,
                isPrimaryKey: false,
                isNullable: true,
              }));
            }
            if (!hasTenant()) {
              return [];
            }
            const dataExtension = resolveDataExtension(table.name);
            const customerKey = dataExtension?.customerKey ?? table.name;
            return fetchFields(customerKey);
          },
        });

        if (result.type === "issue") {
          const wordInfo = model.getWordUntilPosition(position);
          const wordRange = new monaco.Range(
            position.lineNumber,
            wordInfo.startColumn,
            position.lineNumber,
            position.column,
          );

          return {
            suggestions: [
              {
                label: result.message,
                kind: monaco.languages.CompletionItemKind.Issue,
                insertText: "*",
                detail: result.detail,
                sortText: "0000",
                range: wordRange,
              },
            ],
          };
        }

        if (result.type === "expand") {
          const startPos = model.getPositionAt(
            result.replaceOffsets.startOffset,
          );
          const endPos = model.getPositionAt(result.replaceOffsets.endOffset);
          const replaceRange = new monaco.Range(
            startPos.lineNumber,
            startPos.column,
            endPos.lineNumber,
            endPos.column,
          );

          return {
            suggestions: [
              {
                label: `Expand to ${result.columnCount} columns`,
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: result.expandedColumns,
                detail: "Expand * to full column list",
                documentation: result.expandedColumns,
                range: replaceRange,
                sortText: "0000",
              },
            ],
          };
        }
      }

      const triggerChar = completionContext.triggerCharacter;
      const currentWord = sqlContext.currentWord || "";

      const dataExtensions = getDataExtensions();
      const sharedFolderIds = getSharedFolderIds();

      const hasSystemDataViewsLoaded = dataExtensions.some(
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
      const wordRange = new monaco.Range(
        position.lineNumber,
        wordInfo.startColumn,
        position.lineNumber,
        position.column,
      );

      const keywordSuggestions = buildSqlKeywordCompletions(
        sqlContext.lastKeyword,
      ).map((completion) => ({
        label: completion.label,
        insertText: completion.insertText,
        insertTextRules: completion.insertAsSnippet
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        kind: monaco.languages.CompletionItemKind.Keyword,
        sortText: completion.sortText,
        range: wordRange,
      }));

      if (sqlContext.aliasBeforeDot) {
        const lineContent = model.getLineContent(position.lineNumber);
        const textBeforeCursor = lineContent.slice(0, position.column - 1);
        const dotIndex = textBeforeCursor.lastIndexOf(".");

        const fieldStartColumn =
          dotIndex >= 0 ? dotIndex + 2 : wordInfo.startColumn;
        const fieldRange = new monaco.Range(
          position.lineNumber,
          fieldStartColumn,
          position.lineNumber,
          position.column,
        );

        const table = resolveTableForAlias(
          sqlContext.aliasBeforeDot,
          sqlContext.tablesInScope,
        );
        if (!table) {
          return { suggestions: [] };
        }

        let fields: DataExtensionField[] = [];
        const ownerLabel = table.isSubquery
          ? (table.alias ?? "Subquery")
          : (resolveDataExtension(table.name)?.name ?? table.qualifiedName);
        if (table.isSubquery) {
          fields = table.outputFields.map((name) => ({
            name,
            type: "Text" as const,
            isPrimaryKey: false,
            isNullable: true,
          }));
        } else if (hasTenant()) {
          const dataExtension = resolveDataExtension(table.name);
          const customerKey = dataExtension?.customerKey ?? table.name;
          fields = await fetchFields(customerKey);
        }

        const suggestions = buildFieldSuggestions(fields, { ownerLabel }).map(
          (suggestion) => ({
            label: suggestion.label,
            insertText: suggestion.insertText,
            detail: suggestion.detail,
            kind: monaco.languages.CompletionItemKind.Field,
            sortText: suggestion.label,
            range: fieldRange,
          }),
        );
        return { suggestions };
      }

      if (sqlContext.isAfterFromJoin) {
        const shouldSuggestTables =
          !sqlContext.hasFromJoinTable ||
          sqlContext.cursorInFromJoinTable ||
          bracketRange.inBracket;
        if (shouldSuggestTables) {
          const suggestionsBase = buildDataExtensionSuggestions(
            dataExtensions,
            sharedFolderIds,
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
                  const endPos = model.getPositionAt(replaceOffsets.endOffset);
                  return new monaco.Range(
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
              kind: monaco.languages.CompletionItemKind.Struct,
              detail:
                fieldCount === null ? "Fields: —" : `Fields: ${fieldCount}`,
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
        if (!primaryTable) {
          return { suggestions: keywordSuggestions };
        }

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
        } else if (hasTenant()) {
          const dataExtension = resolveDataExtension(primaryTable.name);
          const customerKey = dataExtension?.customerKey ?? primaryTable.name;
          fields = await fetchFields(customerKey);
        }

        const suggestions = buildFieldSuggestions(fields, {
          prefix: aliasPrefix,
          ownerLabel,
        }).map((suggestion) => ({
          label: suggestion.label,
          insertText: suggestion.insertText,
          detail: suggestion.detail,
          kind: monaco.languages.CompletionItemKind.Field,
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
}
