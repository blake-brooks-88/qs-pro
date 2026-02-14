import Editor, { DiffEditor } from "@monaco-editor/react";

import {
  getEditorOptions,
  MONACO_THEME_NAME,
} from "@/features/editor-workspace/utils/monaco-options";

interface VersionDiffViewerProps {
  savedQueryId: string;
  currentSql: string;
  previousSql: string | null;
  showChanges: boolean;
}

export function VersionDiffViewer({
  savedQueryId,
  currentSql,
  previousSql,
  showChanges,
}: VersionDiffViewerProps) {
  const baseOptions = getEditorOptions();
  const modifiedModelPath = `inmemory://version-history/${savedQueryId}/modified.sql`;
  const originalModelPath = `inmemory://version-history/${savedQueryId}/original.sql`;

  if (!showChanges || previousSql === null) {
    return (
      <Editor
        height="100%"
        defaultLanguage="sql"
        value={currentSql}
        path={modifiedModelPath}
        keepCurrentModel
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
      originalModelPath={originalModelPath}
      modifiedModelPath={modifiedModelPath}
      keepCurrentOriginalModel
      keepCurrentModifiedModel
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
