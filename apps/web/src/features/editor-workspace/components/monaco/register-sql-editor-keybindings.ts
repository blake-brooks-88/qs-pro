import type * as Monaco from "monaco-editor";

export function registerSqlEditorKeybindings(options: {
  editor: Monaco.editor.IStandaloneCodeEditor;
  monaco: typeof Monaco;
  getOnSave: () => (() => void) | undefined;
  getOnSaveAs: () => (() => void) | undefined;
  enableSaveAs: boolean;
  enableRunRequest: boolean;
  getOnRunRequest: () => (() => void) | undefined;
}) {
  const {
    editor,
    monaco,
    getOnSave,
    getOnSaveAs,
    enableSaveAs,
    enableRunRequest,
    getOnRunRequest,
  } = options;

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    getOnSave()?.();
  });

  if (enableSaveAs) {
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS,
      () => {
        getOnSaveAs()?.();
      },
    );
  }

  if (enableRunRequest) {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      getOnRunRequest()?.();
    });
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.NumpadEnter,
      () => {
        getOnRunRequest()?.();
      },
    );
  }

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
    void editor.getAction("editor.action.commentLine")?.run();
  });
}

export function registerCursorPositionListener(options: {
  editor: Monaco.editor.IStandaloneCodeEditor;
  onCursorPositionChange: (offset: number) => void;
}): Monaco.IDisposable {
  const { editor, onCursorPositionChange } = options;

  return editor.onDidChangeCursorPosition((event) => {
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const offset = model.getOffsetAt(event.position);
    onCursorPositionChange(offset);
  });
}
