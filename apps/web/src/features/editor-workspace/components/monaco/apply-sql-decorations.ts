import type * as Monaco from "monaco-editor";

import {
  extractSelectFieldRanges,
  extractTableReferences,
} from "@/features/editor-workspace/utils/sql-context";
import type { SqlDiagnostic } from "@/features/editor-workspace/utils/sql-diagnostics";

export function applySqlDecorations(options: {
  editor: Monaco.editor.IStandaloneCodeEditor;
  monaco: typeof Monaco;
  diagnostics: SqlDiagnostic[];
  currentDecorationIds: string[];
  maxErrorTokenLength: number;
}): string[] {
  const {
    editor,
    monaco,
    diagnostics,
    currentDecorationIds,
    maxErrorTokenLength,
  } = options;

  const model = editor.getModel();
  if (!model) {
    return currentDecorationIds;
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
        diagnostic.endIndex - diagnostic.startIndex <= maxErrorTokenLength,
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

  return editor.deltaDecorations(currentDecorationIds, [
    ...tableDecorations,
    ...fieldDecorations,
    ...errorTokenDecorations,
  ]);
}
