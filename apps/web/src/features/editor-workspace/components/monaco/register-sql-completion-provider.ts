import type * as Monaco from "monaco-editor";

import type {
  DataExtension,
  DataExtensionField,
} from "@/features/editor-workspace/types";

import type { BracketReplacementRange } from "./build-sql-completions";
import { buildSqlCompletions } from "./build-sql-completions";

export type { BracketReplacementRange } from "./build-sql-completions";

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
      const wordInfo = model.getWordUntilPosition(position);
      const cursorIndex = model.getOffsetAt(position);
      const bracketRange = getBracketReplacementRange(model, position);
      const isExplicitTrigger =
        completionContext.triggerKind ===
        monaco.languages.CompletionTriggerKind.Invoke;

      const wordStartOffset = model.getOffsetAt({
        lineNumber: position.lineNumber,
        column: wordInfo.startColumn,
      });

      const normalized = await buildSqlCompletions({
        text: model.getValue(),
        cursorIndex,
        triggerCharacter: completionContext.triggerCharacter,
        isExplicitTrigger,
        bracketRange,
        wordRange: { startOffset: wordStartOffset, endOffset: cursorIndex },
        resolveDataExtension,
        fetchFields,
        getFieldsCount,
        hasTenant,
        dataExtensions: getDataExtensions(),
        sharedFolderIds: getSharedFolderIds(),
      });

      const suggestions = normalized.map((item) => {
        const startPos = model.getPositionAt(item.replaceOffsets.startOffset);
        const endPos = model.getPositionAt(item.replaceOffsets.endOffset);
        const range = new monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column,
        );

        const kind = (() => {
          switch (item.kind) {
            case "keyword":
              return monaco.languages.CompletionItemKind.Keyword;
            case "field":
              return monaco.languages.CompletionItemKind.Field;
            case "table":
              return monaco.languages.CompletionItemKind.Struct;
            case "snippet":
              return monaco.languages.CompletionItemKind.Snippet;
            case "issue":
              return monaco.languages.CompletionItemKind.Issue;
          }
        })();

        return {
          label: item.label,
          insertText: item.insertText,
          detail: item.detail,
          documentation: item.documentation,
          kind,
          sortText: item.sortText,
          range,
          insertTextRules: item.insertAsSnippet
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
        };
      });

      return { suggestions };
    },
  });
}
