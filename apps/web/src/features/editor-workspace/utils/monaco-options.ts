import type { editor } from "monaco-editor";

export const MONACO_THEME_NAME = "qs-pro-sql";

const getCssVarValue = (name: string, fallbackName?: string) => {
  if (typeof window === "undefined") return "";
  const root = getComputedStyle(document.documentElement);
  const value = root.getPropertyValue(name).trim();
  if (value) return value;
  if (!fallbackName) return value;
  return root.getPropertyValue(fallbackName).trim();
};

const getThemeBase = () => {
  if (typeof document === "undefined") return "vs";
  return document.documentElement.classList.contains("dark") ? "vs-dark" : "vs";
};

export const getEditorOptions =
  (): editor.IStandaloneEditorConstructionOptions => ({
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    lineNumbers: "on",
    rulers: [100],
    autoClosingBrackets: "always",
    autoClosingQuotes: "always",
    autoClosingDelete: "always",
    autoIndent: "advanced",
    formatOnPaste: false,
    formatOnType: false,
    quickSuggestions: true,
    fontFamily: "var(--font-mono)",
    fontLigatures: false,
    renderLineHighlight: "line",
    renderWhitespace: "selection",
    roundedSelection: false,
    cursorBlinking: "smooth",
  });

export const applyMonacoTheme = (monaco: typeof import("monaco-editor")) => {
  if (typeof window === "undefined") return;

  const foreground = getCssVarValue("--foreground", "--card-foreground");
  const background = getCssVarValue("--background", "--card");
  const border = getCssVarValue("--border", "--muted");
  const muted = getCssVarValue("--muted-foreground", "--neutral-500");
  const keyword = getCssVarValue("--primary", "--primary-500");
  const string = getCssVarValue("--secondary", "--secondary-500");
  const number = getCssVarValue("--warning", "--warning-500");
  const error = getCssVarValue("--error", "--error-500");
  const warning = getCssVarValue("--warning", "--warning-500");
  const lineHighlight = getCssVarValue("--surface", "--muted");
  const toToken = (value: string) => value.replace("#", "");

  monaco.editor.defineTheme(MONACO_THEME_NAME, {
    base: getThemeBase(),
    inherit: true,
    colors: {
      "editor.background": background,
      "editor.foreground": foreground,
      "editorLineNumber.foreground": muted,
      "editorLineNumber.activeForeground": foreground,
      "editorCursor.foreground": keyword,
      "editorIndentGuide.background": border,
      "editorIndentGuide.activeBackground": border,
      editorLineHighlightBackground: lineHighlight,
      "editorRuler.foreground": border,
      "editorBracketMatch.background": lineHighlight,
      "editorBracketMatch.border": border,
      "editorError.foreground": error,
      "editorWarning.foreground": warning,
    },
    rules: [
      { token: "keyword", foreground: toToken(keyword) },
      { token: "string", foreground: toToken(string) },
      { token: "number", foreground: toToken(number) },
      { token: "comment", foreground: toToken(muted) },
    ],
  });

  monaco.editor.setTheme(MONACO_THEME_NAME);
};
