import type * as Monaco from "monaco-editor";

import type { SqlDiagnostic } from "@/features/editor-workspace/utils/sql-diagnostics";
import { toMonacoMarkers } from "@/features/editor-workspace/utils/sql-diagnostics";

export function applySqlMarkers(options: {
  editor: Monaco.editor.IStandaloneCodeEditor;
  monaco: typeof Monaco;
  diagnostics: SqlDiagnostic[];
  owner?: string;
}) {
  const { editor, monaco, diagnostics, owner = "sql-lint" } = options;

  const model = editor.getModel();
  if (!model) {
    return;
  }

  monaco.editor.setModelMarkers(
    model,
    owner,
    toMonacoMarkers(diagnostics, model.getValue(), monaco),
  );
}
