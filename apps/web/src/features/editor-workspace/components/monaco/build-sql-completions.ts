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

export interface OffsetRange {
  startOffset: number;
  endOffset: number;
}

export type SqlCompletionKind =
  | "keyword"
  | "field"
  | "table"
  | "snippet"
  | "issue";

export interface SqlCompletionItem {
  label: string;
  insertText: string;
  kind: SqlCompletionKind;
  sortText?: string;
  detail?: string;
  documentation?: string;
  insertAsSnippet?: boolean;
  replaceOffsets: OffsetRange;
}

export async function buildSqlCompletions(options: {
  text: string;
  cursorIndex: number;
  triggerCharacter: string | undefined;
  isExplicitTrigger: boolean;
  bracketRange: BracketReplacementRange;
  wordRange: OffsetRange;
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
  dataExtensions: DataExtension[];
  sharedFolderIds: Set<string>;
}): Promise<SqlCompletionItem[]> {
  const {
    text,
    cursorIndex,
    triggerCharacter,
    isExplicitTrigger,
    bracketRange,
    wordRange,
    resolveDataExtension,
    fetchFields,
    getFieldsCount,
    hasTenant,
    dataExtensions,
    sharedFolderIds,
  } = options;

  if (isInsideString(text, cursorIndex) || isInsideComment(text, cursorIndex)) {
    return [];
  }

  const sqlContext = getSqlCursorContext(text, cursorIndex);

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
      return [
        {
          label: result.message,
          kind: "issue",
          insertText: "*",
          detail: result.detail,
          sortText: "0000",
          replaceOffsets: wordRange,
        },
      ];
    }

    if (result.type === "expand") {
      return [
        {
          label: `Expand to ${result.columnCount} columns`,
          kind: "snippet",
          insertText: result.expandedColumns,
          detail: "Expand * to full column list",
          documentation: result.expandedColumns,
          sortText: "0000",
          replaceOffsets: result.replaceOffsets,
        },
      ];
    }
  }

  const currentWord = sqlContext.currentWord || "";
  const hasSystemDataViewsLoaded = dataExtensions.some(
    (de) =>
      (de.name?.startsWith("_") ?? false) ||
      (de.customerKey?.startsWith("_") ?? false),
  );

  const isImmediateContext =
    triggerCharacter === "." ||
    triggerCharacter === "[" ||
    (triggerCharacter === "_" && hasSystemDataViewsLoaded);

  if (
    !isExplicitTrigger &&
    !isImmediateContext &&
    currentWord.length < MIN_TRIGGER_CHARS
  ) {
    return [];
  }

  const keywordSuggestions = buildSqlKeywordCompletions(
    sqlContext.lastKeyword,
  ).map(
    (completion): SqlCompletionItem => ({
      label: completion.label,
      insertText: completion.insertText,
      insertAsSnippet: completion.insertAsSnippet,
      kind: "keyword",
      sortText: completion.sortText,
      replaceOffsets: wordRange,
    }),
  );

  if (sqlContext.aliasBeforeDot) {
    const table = resolveTableForAlias(
      sqlContext.aliasBeforeDot,
      sqlContext.tablesInScope,
    );
    if (!table) {
      return [];
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

    const lineStart = text.lastIndexOf("\n", cursorIndex - 1) + 1;
    const lineBeforeCursor = text.slice(lineStart, cursorIndex);
    const dotIndex = lineBeforeCursor.lastIndexOf(".");
    const fieldStartOffset =
      dotIndex >= 0 ? lineStart + dotIndex + 1 : wordRange.startOffset;

    const replaceOffsets: OffsetRange = {
      startOffset: fieldStartOffset,
      endOffset: cursorIndex,
    };

    return buildFieldSuggestions(fields, { ownerLabel }).map(
      (suggestion): SqlCompletionItem => ({
        label: suggestion.label,
        insertText: suggestion.insertText,
        detail: suggestion.detail,
        kind: "field",
        sortText: suggestion.label,
        replaceOffsets,
      }),
    );
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
          getFieldsCount(suggestion.customerKey, index < MAX_DE_COUNT_FETCH),
        ),
      );

      const suggestions = suggestionsBase.map(
        (suggestion, index): SqlCompletionItem => {
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

          const fieldCount = countResults.at(index);

          return {
            label: suggestion.label,
            insertText,
            kind: "table",
            detail: fieldCount === null ? "Fields: —" : `Fields: ${fieldCount}`,
            replaceOffsets: bracketRange.inBracket ? replaceOffsets : wordRange,
            sortText: `0-${suggestion.label}`,
          };
        },
      );

      const adjustedKeywordSuggestions = keywordSuggestions.map(
        (keywordSuggestion) => ({
          ...keywordSuggestion,
          sortText: `9-${keywordSuggestion.label}`,
        }),
      );

      return [...suggestions, ...adjustedKeywordSuggestions];
    }
  }

  if (sqlContext.isAfterSelect) {
    const primaryTable = getPrimaryTable(sqlContext.tablesInScope);
    if (!primaryTable) {
      return keywordSuggestions;
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
        type: "Text" as const,
        isPrimaryKey: false,
        isNullable: true,
      }));
    } else if (hasTenant()) {
      const dataExtension = resolveDataExtension(primaryTable.name);
      const customerKey = dataExtension?.customerKey ?? primaryTable.name;
      fields = await fetchFields(customerKey);
    }

    const fieldSuggestions = buildFieldSuggestions(fields, {
      prefix: aliasPrefix,
      ownerLabel,
    }).map(
      (suggestion): SqlCompletionItem => ({
        label: suggestion.label,
        insertText: suggestion.insertText,
        detail: suggestion.detail,
        kind: "field",
        sortText: `2-${suggestion.label}`,
        replaceOffsets: wordRange,
      }),
    );

    return [...fieldSuggestions, ...keywordSuggestions];
  }

  return keywordSuggestions;
}
