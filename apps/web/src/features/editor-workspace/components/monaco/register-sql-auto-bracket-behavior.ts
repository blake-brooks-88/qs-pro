import type * as Monaco from "monaco-editor";

import { getSqlCursorContext } from "@/features/editor-workspace/utils/sql-context";

export function registerSqlAutoBracketInsertOnFromJoin(options: {
  editor: Monaco.editor.IStandaloneCodeEditor;
  autoBracketRef: { current: boolean };
}): Monaco.IDisposable {
  const { editor, autoBracketRef } = options;

  return editor.onDidChangeModelContent((event) => {
    if (autoBracketRef.current) {
      return;
    }
    const model = editor.getModel();
    if (!model) {
      return;
    }

    const latestChange = event.changes[event.changes.length - 1];
    if (!latestChange) {
      return;
    }
    if (!latestChange.text) {
      return;
    }

    const changeEnd = latestChange.rangeOffset + latestChange.text.length;
    const prefixStart = Math.max(0, changeEnd - 7);
    const prefix = model.getValue().slice(prefixStart, changeEnd).toLowerCase();
    const shouldInsert = /\b(from|join)\s$/.test(prefix);

    if (!shouldInsert) {
      return;
    }

    const position = model.getPositionAt(changeEnd);
    const nextChar = model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: position.column,
      endLineNumber: position.lineNumber,
      endColumn: position.column + 1,
    });

    if (nextChar.startsWith("[")) {
      return;
    }

    autoBracketRef.current = true;
    editor.trigger("keyboard", "type", { text: "[" });
    autoBracketRef.current = false;
  });
}

export function registerSqlSuggestRetriggerOnDot(options: {
  editor: Monaco.editor.IStandaloneCodeEditor;
}): Monaco.IDisposable {
  const { editor } = options;

  return editor.onDidChangeModelContent((event) => {
    const model = editor.getModel();
    if (!model) {
      return;
    }

    const latestChange = event.changes[event.changes.length - 1];
    if (!latestChange) {
      return;
    }

    const insertedText = latestChange.text;
    if (insertedText?.length !== 1) {
      return;
    }
    if (!/[a-zA-Z0-9_]/.test(insertedText)) {
      return;
    }

    const changeEnd = latestChange.rangeOffset + insertedText.length;
    if (changeEnd < 2) {
      return;
    }

    const charBeforeInsert = model.getValue().charAt(changeEnd - 2);
    if (charBeforeInsert !== ".") {
      return;
    }

    editor.trigger("retrigger", "editor.action.triggerSuggest", {});
  });
}

export function registerSqlTabExpandFromJoin(options: {
  editor: Monaco.editor.IStandaloneCodeEditor;
  monaco: typeof Monaco;
  autoBracketRef: { current: boolean };
}): Monaco.IDisposable {
  const { editor, monaco, autoBracketRef } = options;

  return editor.onKeyDown((event) => {
    if (event.keyCode !== monaco.KeyCode.Tab) {
      return;
    }
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    const model = editor.getModel();
    const position = editor.getPosition();
    if (!model || !position) {
      return;
    }

    const offset = model.getOffsetAt(position);
    const wordInfo = model.getWordUntilPosition(position);
    const currentWord = wordInfo.word ?? "";
    const charBefore = model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: Math.max(1, position.column - 1),
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    });

    if (/\s/.test(charBefore)) {
      return;
    }

    const fromJoinMatch = currentWord.match(
      /^(?:f|fr|fro|from|j|jo|joi|join)$/i,
    );
    const isFromOrJoinPrefix =
      wordInfo.endColumn === position.column && fromJoinMatch !== null;
    if (!isFromOrJoinPrefix) {
      return;
    }

    const expandedKeyword = /^f/i.test(currentWord) ? "FROM" : "JOIN";

    const sqlContext = getSqlCursorContext(model.getValue(), offset);
    if (sqlContext.hasFromJoinTable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    autoBracketRef.current = true;
    const replacement = `${expandedKeyword} `;
    editor.executeEdits("auto-bracket-tab", [
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
    editor.setPosition({
      lineNumber: position.lineNumber,
      column: wordInfo.startColumn + replacement.length,
    });

    const insertOpenBracket = () => {
      editor.trigger("keyboard", "type", { text: "[" });
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(insertOpenBracket);
    } else {
      setTimeout(insertOpenBracket, 0);
    }

    autoBracketRef.current = false;
  });
}
