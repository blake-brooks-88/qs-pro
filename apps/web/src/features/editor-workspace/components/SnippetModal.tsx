import Editor from "@monaco-editor/react";
import type {
  CreateSnippetDto,
  SnippetScope,
  UpdateSnippetDto,
} from "@qpp/shared-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useCreateSnippet,
  useUpdateSnippet,
} from "@/features/editor-workspace/hooks/use-snippets";
import {
  applyMonacoTheme,
  getEditorOptions,
  MONACO_THEME_NAME,
} from "@/features/editor-workspace/utils/monaco-options";

export interface SnippetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit" | "duplicate";
  initialData?: {
    title?: string;
    triggerPrefix?: string;
    code?: string;
    description?: string;
    scope?: SnippetScope;
  };
  snippetId?: string;
}

interface DetectedPlaceholder {
  original: string;
  index: number;
  converted: boolean;
}

function detectBracketedNames(code: string): DetectedPlaceholder[] {
  const seen = new Set<string>();
  const results: DetectedPlaceholder[] = [];
  // Match [SomeName] patterns that appear after FROM, JOIN keywords (or anywhere in SQL)
  const bracketPattern = /\[([A-Za-z_][A-Za-z0-9_ ]*)\]/g;
  let match: RegExpExecArray | null;

  while ((match = bracketPattern.exec(code)) !== null) {
    const name = match[1] as string;
    if (!seen.has(name)) {
      seen.add(name);
      results.push({
        original: name,
        index: results.length + 1,
        converted: false,
      });
    }
  }
  return results;
}

function detectColumnReferences(code: string): DetectedPlaceholder[] {
  const seen = new Set<string>();
  const results: DetectedPlaceholder[] = [];
  const colPattern = /\b([a-zA-Z])\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
  let match: RegExpExecArray | null;

  while ((match = colPattern.exec(code)) !== null) {
    const full = match[0] as string;
    const matchIndex = match.index;

    // Skip patterns already inside ${N:...} tab-stop syntax
    const lastTabStop = code.lastIndexOf("${", matchIndex);
    if (lastTabStop !== -1) {
      const closingBrace = code.indexOf("}", lastTabStop);
      if (closingBrace > matchIndex) {
        continue;
      }
    }

    if (!seen.has(full)) {
      seen.add(full);
      results.push({
        original: full,
        index: results.length + 1,
        converted: false,
      });
    }
  }
  return results;
}

const TRIGGER_PREFIX_REGEX = /^[a-zA-Z][a-zA-Z0-9]*$/;

function validateTriggerPrefix(value: string): string | null {
  if (!value) {
    return "Trigger prefix is required";
  }
  if (value.length > 50) {
    return "Trigger prefix must be 50 characters or less";
  }
  if (!TRIGGER_PREFIX_REGEX.test(value)) {
    return "Must start with a letter and contain only alphanumeric characters";
  }
  return null;
}

export function SnippetModal({
  open,
  onOpenChange,
  mode,
  initialData,
  snippetId,
}: SnippetModalProps) {
  const createSnippet = useCreateSnippet();
  const updateSnippet = useUpdateSnippet();

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [triggerPrefix, setTriggerPrefix] = useState(
    initialData?.triggerPrefix ?? "",
  );
  const [description, setDescription] = useState(
    initialData?.description ?? "",
  );
  const [code, setCode] = useState(initialData?.code ?? "");
  const [scope, setScope] = useState<SnippetScope>(initialData?.scope ?? "bu");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [prefixError, setPrefixError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [placeholders, setPlaceholders] = useState<DetectedPlaceholder[]>([]);
  const [columnRefs, setColumnRefs] = useState<DetectedPlaceholder[]>([]);

  // Reset form when modal opens or mode/initialData changes
  useEffect(() => {
    if (open) {
      setTitle(initialData?.title ?? "");
      setTriggerPrefix(initialData?.triggerPrefix ?? "");
      setDescription(initialData?.description ?? "");
      setCode(initialData?.code ?? "");
      setScope(initialData?.scope ?? "bu");
      setTitleError(null);
      setPrefixError(null);
      setCodeError(null);

      // Auto-detect placeholders for create mode with pre-filled code
      if (mode === "create" && initialData?.code) {
        setPlaceholders(detectBracketedNames(initialData.code));
        setColumnRefs(detectColumnReferences(initialData.code));
      } else {
        setPlaceholders([]);
        setColumnRefs([]);
      }
    }
  }, [open, initialData, mode]);

  const dialogTitle = useMemo(() => {
    switch (mode) {
      case "create":
        return "New Snippet";
      case "edit":
        return "Edit Snippet";
      case "duplicate":
        return "Duplicate Snippet";
    }
  }, [mode]);

  const handleConvertPlaceholder = useCallback(
    (placeholder: DetectedPlaceholder) => {
      if (placeholder.converted) {
        return;
      }

      const nextN =
        placeholders.filter((p) => p.converted).length +
        columnRefs.filter((p) => p.converted).length +
        1;
      const replacement = `\${${nextN}:${placeholder.original}}`;
      const escapedName = placeholder.original.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );

      const updatedCode = code.replace(
        new RegExp(`\\[${escapedName}\\]`, "g"),
        replacement,
      );
      setCode(updatedCode);
      setPlaceholders((prev) =>
        prev.map((p) =>
          p.original === placeholder.original ? { ...p, converted: true } : p,
        ),
      );
    },
    [code, placeholders, columnRefs],
  );

  const handleConvertColumnRef = useCallback(
    (colRef: DetectedPlaceholder) => {
      if (colRef.converted) {
        return;
      }

      const nextN =
        placeholders.filter((p) => p.converted).length +
        columnRefs.filter((p) => p.converted).length +
        1;
      const columnName = colRef.original.split(".")[1] ?? colRef.original;
      const replacement = `\${${nextN}:${columnName}}`;
      const escapedFull = colRef.original.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );

      const updatedCode = code.replace(
        new RegExp(`\\b${escapedFull}\\b`, "g"),
        replacement,
      );
      setCode(updatedCode);
      setColumnRefs((prev) =>
        prev.map((p) =>
          p.original === colRef.original ? { ...p, converted: true } : p,
        ),
      );
    },
    [code, placeholders, columnRefs],
  );

  const validate = useCallback(() => {
    let valid = true;
    if (!title.trim()) {
      setTitleError("Title is required");
      valid = false;
    } else if (title.length > 255) {
      setTitleError("Title must be 255 characters or less");
      valid = false;
    } else {
      setTitleError(null);
    }

    const prefErr = validateTriggerPrefix(triggerPrefix);
    if (prefErr) {
      setPrefixError(prefErr);
      valid = false;
    } else {
      setPrefixError(null);
    }

    if (!code.trim()) {
      setCodeError("SQL code is required");
      valid = false;
    } else {
      setCodeError(null);
    }

    return valid;
  }, [title, triggerPrefix, code]);

  const handleSave = useCallback(async () => {
    if (!validate()) {
      return;
    }

    try {
      if (mode === "edit" && snippetId) {
        const updateData: UpdateSnippetDto = {
          title: title.trim(),
          triggerPrefix: triggerPrefix.trim(),
          code: code.trim(),
          description: description.trim() || undefined,
          scope,
        };
        await updateSnippet.mutateAsync({ id: snippetId, data: updateData });
        toast.success("Snippet updated");
      } else {
        const createData: CreateSnippetDto = {
          title: title.trim(),
          triggerPrefix: triggerPrefix.trim(),
          code: code.trim(),
          description: description.trim() || undefined,
          scope,
        };
        await createSnippet.mutateAsync(createData);
        toast.success(
          mode === "duplicate" ? "Snippet duplicated" : "Snippet created",
        );
      }
      onOpenChange(false);
    } catch {
      toast.error("Failed to save snippet. Please try again.");
    }
  }, [
    validate,
    mode,
    snippetId,
    title,
    triggerPrefix,
    code,
    description,
    scope,
    updateSnippet,
    createSnippet,
    onOpenChange,
  ]);

  const isPending = createSnippet.isPending || updateSnippet.isPending;

  const unconvertedPlaceholders = useMemo(
    () => placeholders.filter((p) => !p.converted),
    [placeholders],
  );

  const unconvertedColumnRefs = useMemo(
    () => columnRefs.filter((p) => !p.converted),
    [columnRefs],
  );

  const editorOptions = useMemo(
    () => ({
      ...getEditorOptions(),
      minimap: { enabled: false },
      lineNumbers: "off" as const,
      scrollBeyondLastLine: false,
      wordWrap: "on" as const,
      folding: false,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 0,
      glyphMargin: false,
    }),
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {/* Title */}
          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="snippet-title"
            >
              Title <span className="text-destructive">*</span>
            </label>
            <Input
              id="snippet-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) {
                  setTitleError(null);
                }
              }}
              placeholder="e.g. Subscriber KEY JOIN"
              className={titleError ? "border-destructive" : ""}
            />
            {titleError ? (
              <p className="text-xs text-destructive">{titleError}</p>
            ) : null}
          </div>

          {/* Trigger Prefix */}
          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="snippet-prefix"
            >
              Trigger Prefix <span className="text-destructive">*</span>
            </label>
            <Input
              id="snippet-prefix"
              value={triggerPrefix}
              onChange={(e) => {
                setTriggerPrefix(e.target.value);
                if (prefixError) {
                  setPrefixError(null);
                }
              }}
              placeholder="e.g. mysel"
              className={`font-mono ${prefixError ? "border-destructive" : ""}`}
            />
            {prefixError ? (
              <p className="text-xs text-destructive">{prefixError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Type this prefix + Ctrl+Space to trigger in the editor
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="snippet-description"
            >
              Description
            </label>
            <textarea
              id="snippet-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
              maxLength={1000}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          {/* Scope */}
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Scope</span>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="snippet-scope"
                  value="bu"
                  checked={scope === "bu"}
                  onChange={() => setScope("bu")}
                  className="text-primary"
                />
                <span className="text-sm">This BU</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="snippet-scope"
                  value="tenant"
                  checked={scope === "tenant"}
                  onChange={() => setScope("tenant")}
                  className="text-primary"
                />
                <span className="text-sm">All BUs in tenant</span>
              </label>
            </div>
          </div>

          {/* Code Editor */}
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              SQL Code <span className="text-destructive">*</span>
            </span>
            <div
              className={`rounded-md border overflow-hidden ${codeError ? "border-destructive" : "border-border"}`}
              style={{ minHeight: "300px" }}
            >
              <Editor
                height="300px"
                defaultLanguage="sql"
                theme={MONACO_THEME_NAME}
                value={code}
                onChange={(v) => {
                  setCode(v ?? "");
                  if (codeError) {
                    setCodeError(null);
                  }
                  if (mode === "create") {
                    setPlaceholders(detectBracketedNames(v ?? ""));
                    setColumnRefs(detectColumnReferences(v ?? ""));
                  }
                }}
                options={editorOptions}
                onMount={(_, monacoInstance) => {
                  applyMonacoTheme(monacoInstance);
                }}
              />
            </div>
            {codeError ? (
              <p className="text-xs text-destructive">{codeError}</p>
            ) : null}
          </div>

          {/* Placeholder helper */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Use{" "}
              <code className="font-mono bg-muted px-1 rounded">
                {"${1:name}"}
              </code>{" "}
              syntax for tab-stop placeholders
            </p>
            {unconvertedPlaceholders.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">
                  Detected bracketed names — click to convert to placeholders:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unconvertedPlaceholders.map((p) => (
                    <button
                      key={p.original}
                      type="button"
                      onClick={() => handleConvertPlaceholder(p)}
                      className="px-2 py-0.5 text-xs font-mono bg-primary/10 text-primary border border-primary/20 rounded hover:bg-primary/20 transition-colors"
                    >
                      [{p.original}]
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {unconvertedColumnRefs.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">
                  Column references — click to convert to placeholders:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unconvertedColumnRefs.map((p) => (
                    <button
                      key={p.original}
                      type="button"
                      onClick={() => handleConvertColumnRef(p)}
                      className="px-2 py-0.5 text-xs font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded hover:bg-amber-500/20 transition-colors"
                    >
                      {p.original}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
