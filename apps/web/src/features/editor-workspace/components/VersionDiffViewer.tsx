import Editor, { DiffEditor } from "@monaco-editor/react";

import {
  getEditorOptions,
  MONACO_THEME_NAME,
} from "@/features/editor-workspace/utils/monaco-options";

interface VersionDiffViewerProps {
  currentSql: string;
  previousSql: string | null;
  showChanges: boolean;
}

export function VersionDiffViewer({
  currentSql,
  previousSql,
  showChanges,
}: VersionDiffViewerProps) {
  const baseOptions = getEditorOptions();

  if (!showChanges || previousSql === null) {
    return (
      <Editor
        height="100%"
        defaultLanguage="sql"
        value={currentSql}
        theme={MONACO_THEME_NAME}
        options={{
          ...baseOptions,
          readOnly: true,
          minimap: { enabled: false },
        }}
      />
    );
  }

  return (
    <DiffEditor
      height="100%"
      language="sql"
      original={previousSql}
      modified={currentSql}
      theme={MONACO_THEME_NAME}
      options={{
        ...baseOptions,
        readOnly: true,
        renderSideBySide: false,
        renderIndicators: true,
        renderOverviewRuler: false,
        renderMarginRevertIcon: false,
        ignoreTrimWhitespace: true,
        originalEditable: false,
        enableSplitViewResizing: false,
        hideUnchangedRegions: {
          enabled: false,
        },
        minimap: { enabled: false },
      }}
    />
  );
}
