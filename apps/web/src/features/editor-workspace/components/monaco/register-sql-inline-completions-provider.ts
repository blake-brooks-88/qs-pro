import type * as Monaco from "monaco-editor";

import type { DataExtensionField } from "@/features/editor-workspace/types";
import { getInlineCompletionReplacementEndOffset } from "@/features/editor-workspace/utils/inline-completion-range";
import type { InlineSuggestionContext } from "@/features/editor-workspace/utils/inline-suggestions";
import { evaluateInlineSuggestions } from "@/features/editor-workspace/utils/inline-suggestions";
import { getSqlCursorContext } from "@/features/editor-workspace/utils/sql-context";

export function registerSqlInlineCompletionsProvider(options: {
  monaco: typeof Monaco;
  resolveDataExtension: (name: string) => { customerKey: string } | undefined;
  fetchFields: (
    customerKey: string,
    signal?: AbortSignal,
  ) => Promise<DataExtensionField[]>;
}): Monaco.IDisposable {
  const { monaco, resolveDataExtension, fetchFields } = options;

  return monaco.languages.registerInlineCompletionsProvider("sql", {
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
            return table.outputFields.map(
              (name): DataExtensionField => ({
                name,
                type: "Text" as const,
                isPrimaryKey: false,
                isNullable: true,
              }),
            );
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
        return new monaco.Range(
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
          ...(suggestion.alternatives ?? []).map((alt) => ({
            insertText: alt,
            range: buildInlineRangeForInsertText(alt),
          })),
        ],
      };
    },
    freeInlineCompletions: () => {},
    disposeInlineCompletions: () => {},
  } as Parameters<
    typeof monaco.languages.registerInlineCompletionsProvider
  >[1]);
}
