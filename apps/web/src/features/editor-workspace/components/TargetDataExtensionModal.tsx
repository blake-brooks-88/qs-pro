import {
  AltArrowDown,
  CloseCircle,
  Database,
  InfoCircle,
  Magnifer,
  Play,
} from "@solar-icons/react";
import { Parser } from "node-sql-parser";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDataExtensionFields } from "@/features/editor-workspace/hooks/use-metadata";
import type { DataExtension } from "@/features/editor-workspace/types";
import { cn } from "@/lib/utils";

interface TargetDataExtensionModalProps {
  isOpen: boolean;
  tenantId?: string | null;
  dataExtensions: DataExtension[];
  sqlText: string;
  onClose: () => void;
  onSelect: (customerKey: string) => void;
}

type CompatibilityState =
  | "idle"
  | "checking"
  | "compatible"
  | "incompatible"
  | "unknown";

type CompatibilityDetails = {
  state: CompatibilityState;
  summary?: string;
  missingInTarget: string[];
  requiredMissingFromQuery: string[];
  duplicateOutputColumns: string[];
};

const sqlParser = new Parser();
const DIALECT = "transactsql";

function stripBrackets(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeFieldName(name: string): string {
  return stripBrackets(name).trim().toLowerCase();
}

function extractOutputColumnNames(
  sqlText: string,
): { ok: true; names: string[] } | { ok: false; reason: string } {
  let ast: unknown;
  try {
    ast = sqlParser.astify(sqlText, { database: DIALECT });
  } catch (error) {
    return {
      ok: false,
      reason: `Failed to parse SQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }

  const statements = Array.isArray(ast) ? ast : [ast];
  const selectStmt = statements.find(
    (stmt): stmt is { type?: unknown; columns?: unknown[] } =>
      Boolean(
        stmt &&
        typeof stmt === "object" &&
        (stmt as { type?: unknown }).type === "select",
      ),
  );

  if (!selectStmt || !Array.isArray(selectStmt.columns)) {
    return { ok: false, reason: "No SELECT statement found" };
  }

  const names: string[] = [];

  for (let i = 0; i < selectStmt.columns.length; i++) {
    const col = selectStmt.columns[i] as unknown;

    if (col === "*") {
      return {
        ok: false,
        reason: "SELECT * cannot be validated for compatibility",
      };
    }

    if (!col || typeof col !== "object") {
      return { ok: false, reason: "Unsupported SELECT column" };
    }

    const record = col as {
      as?: unknown;
      expr?: { type?: unknown; column?: unknown } | undefined;
      type?: unknown;
      column?: unknown;
    };

    if (typeof record.as === "string" && record.as.trim()) {
      names.push(stripBrackets(record.as));
      continue;
    }

    const expr = record.expr;
    const isColumnRef =
      expr?.type === "column_ref" || record.type === "column_ref";
    const columnValue = (expr?.column ?? record.column) as unknown;

    if (isColumnRef) {
      if (columnValue === "*") {
        return {
          ok: false,
          reason: "SELECT * cannot be validated for compatibility",
        };
      }
      if (typeof columnValue === "string" && columnValue.trim()) {
        names.push(stripBrackets(columnValue));
        continue;
      }
    }

    return {
      ok: false,
      reason: "Cannot validate computed columns without an explicit AS alias",
    };
  }

  return { ok: true, names };
}

export function TargetDataExtensionModal({
  isOpen,
  tenantId,
  dataExtensions,
  sqlText,
  onClose,
  onSelect,
}: TargetDataExtensionModalProps) {
  const [search, setSearch] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setSelectedTargetId(null);
      setIsSearchFocused(false);
      setDetailsOpen(false);
    }
  }, [isOpen]);

  const filteredTargets = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term && !isSearchFocused) {
      return [];
    }
    return dataExtensions
      .filter((de) => {
        return (
          de.name.toLowerCase().includes(term) ||
          de.customerKey.toLowerCase().includes(term)
        );
      })
      .slice(0, 10);
  }, [dataExtensions, search, isSearchFocused]);

  const selectedTarget = useMemo(() => {
    return dataExtensions.find((de) => de.id === selectedTargetId) ?? null;
  }, [dataExtensions, selectedTargetId]);

  const selectedCustomerKey = selectedTarget?.customerKey;
  const fieldsQuery = useDataExtensionFields({
    tenantId,
    customerKey: selectedCustomerKey,
    enabled: Boolean(isOpen && selectedCustomerKey),
  });

  const compatibility = useMemo((): CompatibilityDetails => {
    if (!selectedTarget || !isOpen) {
      return {
        state: "idle",
        missingInTarget: [],
        requiredMissingFromQuery: [],
        duplicateOutputColumns: [],
      };
    }

    if (!selectedCustomerKey) {
      return {
        state: "unknown",
        summary: "No target Data Extension selected",
        missingInTarget: [],
        requiredMissingFromQuery: [],
        duplicateOutputColumns: [],
      };
    }

    if (fieldsQuery.isLoading) {
      return {
        state: "checking",
        summary: "Checking compatibility...",
        missingInTarget: [],
        requiredMissingFromQuery: [],
        duplicateOutputColumns: [],
      };
    }

    const targetFields = fieldsQuery.data ?? selectedTarget.fields;
    if (!targetFields || targetFields.length === 0) {
      return {
        state: "unknown",
        summary:
          "Unable to validate compatibility (missing target field metadata)",
        missingInTarget: [],
        requiredMissingFromQuery: [],
        duplicateOutputColumns: [],
      };
    }

    const extracted = extractOutputColumnNames(sqlText);
    if (!extracted.ok) {
      return {
        state: "unknown",
        summary: `Unable to validate compatibility (${extracted.reason})`,
        missingInTarget: [],
        requiredMissingFromQuery: [],
        duplicateOutputColumns: [],
      };
    }

    const outputNames = extracted.names;
    const outputSet = new Set(outputNames.map(normalizeFieldName));
    const targetSet = new Set(
      targetFields.map((f) => normalizeFieldName(f.name)),
    );

    const missingInTarget = outputNames.filter(
      (name) => !targetSet.has(normalizeFieldName(name)),
    );

    const requiredMissingFromQuery = targetFields
      .filter((f) => f.isNullable === false)
      .map((f) => f.name)
      .filter((name) => !outputSet.has(normalizeFieldName(name)));

    const counts = new Map<string, number>();
    for (const name of outputNames) {
      const normalized = normalizeFieldName(name);
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }

    const duplicateOutputColumns = outputNames.filter((name) => {
      const normalized = normalizeFieldName(name);
      return (counts.get(normalized) ?? 0) > 1;
    });

    const isIncompatible =
      missingInTarget.length > 0 ||
      requiredMissingFromQuery.length > 0 ||
      duplicateOutputColumns.length > 0;

    if (isIncompatible) {
      return {
        state: "incompatible",
        summary: "Target Data Extension is not compatible with this query.",
        missingInTarget,
        requiredMissingFromQuery,
        duplicateOutputColumns,
      };
    }

    return {
      state: "compatible",
      summary: "Target Data Extension is compatible.",
      missingInTarget: [],
      requiredMissingFromQuery: [],
      duplicateOutputColumns: [],
    };
  }, [
    fieldsQuery.data,
    fieldsQuery.isLoading,
    isOpen,
    selectedCustomerKey,
    selectedTarget,
    sqlText,
  ]);

  const canRun =
    Boolean(selectedTargetId) && compatibility.state !== "incompatible";

  const handleSelectTarget = (de: DataExtension) => {
    setSelectedTargetId(de.id);
    setSearch("");
    setIsSearchFocused(false);
    setDetailsOpen(false);
  };

  const handleRun = () => {
    if (!selectedTarget) {
      return;
    }
    onSelect(selectedTarget.customerKey);
  };

  const sqlPreview = useMemo(() => {
    const trimmed = sqlText.trim();
    if (trimmed.length <= 100) {
      return trimmed;
    }
    return `${trimmed.slice(0, 100)}...`;
  }, [sqlText]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl bg-card border-border p-0 overflow-hidden">
        <div className="bg-primary/5 px-6 py-8 border-b border-primary/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shadow-inner">
              <Database size={28} weight="Bold" className="text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-display text-2xl font-bold tracking-tight">
                Run to Target DE
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Write query results directly to an existing Data Extension
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {sqlPreview ? (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                Query Preview
              </span>
              <div className="bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-xs font-mono text-muted-foreground overflow-hidden">
                {sqlPreview}
              </div>
            </div>
          ) : null}

          <div className="space-y-5 bg-muted/30 p-5 rounded-xl border border-border/50">
            <div className="space-y-1.5 relative" ref={searchRef}>
              <label
                htmlFor="target-de-search"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
              >
                Target Data Extension
              </label>

              <div className="relative">
                {selectedTarget ? (
                  <div className="flex items-center gap-3 w-full bg-background border border-primary/50 rounded-lg pl-3 pr-2 py-2 group shadow-sm">
                    <Database
                      size={20}
                      weight="Bold"
                      className="text-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        {selectedTarget.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {selectedTarget.customerKey}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedTargetId(null)}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all"
                    >
                      <CloseCircle size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="relative group">
                    <Magnifer
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors"
                    />
                    <input
                      id="target-de-search"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setIsSearchFocused(true);
                      }}
                      onFocus={() => setIsSearchFocused(true)}
                      placeholder="Search by name or customer key..."
                      className="w-full bg-background border border-border rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <AltArrowDown
                        size={18}
                        className="text-muted-foreground"
                      />
                    </div>
                  </div>
                )}

                {isSearchFocused ? (
                  <div className="absolute z-10 top-full mt-1 w-full bg-background border border-border rounded-lg shadow-xl max-h-[200px] overflow-y-auto overflow-x-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    {filteredTargets.length > 0 ? (
                      filteredTargets.map((de) => (
                        <button
                          key={de.id}
                          onClick={() => handleSelectTarget(de)}
                          className="w-full text-left px-4 py-2.5 hover:bg-primary/5 flex items-center gap-3 transition-colors border-l-2 border-transparent hover:border-primary"
                        >
                          <Database
                            size={16}
                            className="text-muted-foreground shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate">
                              {de.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {de.customerKey}
                            </p>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-8 text-center">
                        <InfoCircle
                          size={24}
                          className="mx-auto text-muted-foreground/30 mb-2"
                        />
                        <p className="text-xs text-muted-foreground">
                          No matching Data Extensions found
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border text-xs",
                "bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-400",
              )}
            >
              <InfoCircle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Overwrite Warning</p>
                <p className="text-muted-foreground mt-0.5">
                  Results will completely replace existing data in the target
                  DE.
                </p>
              </div>
            </div>

            {selectedTarget ? (
              <div
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  compatibility.state === "compatible"
                    ? "bg-success/10 border-success/25 text-success-foreground"
                    : compatibility.state === "incompatible"
                      ? "bg-destructive/10 border-destructive/25 text-destructive"
                      : "bg-muted/50 border-border text-muted-foreground",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">Compatibility</p>
                    <p className="mt-0.5 text-[11px] leading-snug break-words">
                      {compatibility.summary ??
                        (compatibility.state === "checking"
                          ? "Checking compatibility..."
                          : compatibility.state === "unknown"
                            ? "Unable to validate compatibility"
                            : compatibility.state === "compatible"
                              ? "Compatible"
                              : compatibility.state === "incompatible"
                                ? "Not compatible"
                                : "")}
                    </p>
                  </div>

                  {compatibility.state === "incompatible" ? (
                    <Button
                      variant="ghost"
                      onClick={() => setDetailsOpen((prev) => !prev)}
                      className="h-8 px-3 text-[10px] font-bold"
                    >
                      {detailsOpen ? "Hide details" : "View details"}
                    </Button>
                  ) : null}
                </div>

                {compatibility.state === "incompatible" && detailsOpen ? (
                  <div className="mt-2 space-y-2 text-[11px]">
                    {compatibility.missingInTarget.length > 0 ? (
                      <div>
                        <p className="font-semibold">Missing in target</p>
                        <p className="text-muted-foreground">
                          {compatibility.missingInTarget.join(", ")}
                        </p>
                      </div>
                    ) : null}
                    {compatibility.requiredMissingFromQuery.length > 0 ? (
                      <div>
                        <p className="font-semibold">
                          Required fields not selected
                        </p>
                        <p className="text-muted-foreground">
                          {compatibility.requiredMissingFromQuery.join(", ")}
                        </p>
                      </div>
                    ) : null}
                    {compatibility.duplicateOutputColumns.length > 0 ? (
                      <div>
                        <p className="font-semibold">
                          Duplicate output columns
                        </p>
                        <p className="text-muted-foreground">
                          {compatibility.duplicateOutputColumns.join(", ")}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="bg-muted/30 px-6 py-4 border-t border-border flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            disabled={!canRun}
            onClick={handleRun}
            className="bg-success hover:bg-success/90 text-success-foreground text-xs font-bold px-6 h-10 shadow-lg shadow-success/20 disabled:opacity-50 transition-all active:scale-95"
          >
            <Play size={16} weight="Bold" className="mr-2" />
            Run Query
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
