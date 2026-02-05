import {
  AltArrowDown,
  CloseCircle,
  DangerTriangle,
  Database,
  InfoCircle,
  Magnifer,
  Rocket,
} from "@solar-icons/react";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDataExtensionDetails } from "@/features/editor-workspace/hooks/use-data-extension-details";
import type {
  DataExtension,
  Folder,
  QueryActivityDraft,
} from "@/features/editor-workspace/types";
import { cn } from "@/lib/utils";

import { FolderTreePicker } from "./FolderTreePicker";
import { TargetDECreationView } from "./TargetDECreationView";

interface QueryActivityModalProps {
  isOpen: boolean;
  tenantId?: string | null;
  eid?: string;
  dataExtensions: DataExtension[];
  folders: Folder[];
  queryClient?: QueryClient;
  queryText: string;
  initialName?: string;
  isPending?: boolean;
  onClose: () => void;
  onSubmit?: (draft: QueryActivityDraft) => Promise<void>;
}

export function QueryActivityModal({
  isOpen,
  tenantId,
  eid,
  dataExtensions,
  folders,
  queryClient,
  queryText,
  initialName,
  isPending = false,
  onClose,
  onSubmit,
}: QueryActivityModalProps) {
  const [view, setView] = useState<"selection" | "creation">("selection");
  const [search, setSearch] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [targetUpdateType, setTargetUpdateType] =
    useState<QueryActivityDraft["targetUpdateType"]>("Overwrite");
  const [activityName, setActivityName] = useState(initialName ?? "");
  const [description, setDescription] = useState("");
  const [externalKey, setExternalKey] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");

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

  // Reset form state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setView("selection");
      setSearch("");
      setIsSearchFocused(false);
      setHighlightedIndex(-1);
      setSelectedTargetId(null);
      setTargetUpdateType("Overwrite");
      setActivityName(initialName ?? "");
      setDescription("");
      setExternalKey("");
      setSelectedFolderId("");
    }
  }, [isOpen, initialName]);

  // Reset highlighted index when search changes or dropdown closes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [search, isSearchFocused]);

  // Filter to local DEs only - shared DEs cannot be used as query targets from child BUs
  const localDataExtensions = useMemo(
    () => dataExtensions.filter((de) => !de.isShared),
    [dataExtensions],
  );

  const filteredTargets = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term && !isSearchFocused) {
      return [];
    }
    return localDataExtensions
      .filter((de) => {
        return (
          de.name.toLowerCase().includes(term) ||
          de.customerKey.toLowerCase().includes(term)
        );
      })
      .slice(0, 10);
  }, [localDataExtensions, search, isSearchFocused]);

  const selectedTarget = useMemo(() => {
    return localDataExtensions.find((de) => de.id === selectedTargetId) ?? null;
  }, [localDataExtensions, selectedTargetId]);

  // Fetch DE details (including PK info) when a target is selected
  const { data: targetDetails, isLoading: isLoadingDetails } =
    useDataExtensionDetails({
      customerKey: selectedTarget?.customerKey ?? null,
    });

  // PK validation for Update mode
  const needsPrimaryKey = targetUpdateType === "Update";
  const hasPrimaryKey = targetDetails?.hasPrimaryKey ?? false;
  const isPrimaryKeyMissing =
    needsPrimaryKey && targetDetails && !hasPrimaryKey;

  const canCreate =
    Boolean(activityName.trim()) &&
    Boolean(selectedTargetId) &&
    !isLoadingDetails &&
    !(needsPrimaryKey && !hasPrimaryKey);

  const handleSelectTarget = (de: DataExtension) => {
    setSelectedTargetId(de.id);
    setSearch("");
    setIsSearchFocused(false);
    setHighlightedIndex(-1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!isSearchFocused) {
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (filteredTargets.length > 0) {
          setHighlightedIndex((i) =>
            Math.min(i + 1, filteredTargets.length - 1),
          );
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter": {
        e.preventDefault();
        const target = filteredTargets[highlightedIndex];
        if (target) {
          handleSelectTarget(target);
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        setIsSearchFocused(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleCreationComplete = (newDE: DataExtension) => {
    setSelectedTargetId(newDE.id);
    setView("selection");
  };

  if (view === "creation" && queryClient) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl bg-card border-border p-0 overflow-hidden">
          <TargetDECreationView
            tenantId={tenantId}
            eid={eid}
            sqlText={queryText}
            folders={folders}
            dataExtensions={dataExtensions}
            queryClient={queryClient}
            onBack={() => setView("selection")}
            onCreated={handleCreationComplete}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !isPending && onClose()}
    >
      <DialogContent
        className="max-w-2xl bg-card border-border p-0 overflow-hidden"
        onInteractOutside={(e) => isPending && e.preventDefault()}
        onEscapeKeyDown={(e) => isPending && e.preventDefault()}
      >
        <div className="bg-primary/5 px-6 py-8 border-b border-primary/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shadow-inner">
              <Rocket size={28} weight="Bold" className="text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-display text-2xl font-bold tracking-tight">
                Deploy to Automation
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Configure your query activity for Salesforce Marketing Cloud
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Identity Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="activity-name"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
              >
                Activity Name <span className="text-destructive">*</span>
              </label>
              <input
                id="activity-name"
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                placeholder="e.g. Daily Active Subscribers"
                maxLength={200}
                className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="activity-external-key"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1 flex justify-between items-center"
              >
                External Key
                <span className="text-[8px] font-normal lowercase opacity-60 italic">
                  Optional
                </span>
              </label>
              <input
                id="activity-external-key"
                value={externalKey}
                onChange={(e) => setExternalKey(e.target.value)}
                placeholder="Auto-generated if blank"
                maxLength={36}
                pattern="[a-zA-Z0-9_-]*"
                className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="activity-description"
              className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Description
            </label>
            <textarea
              id="activity-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain what this query does for your future self..."
              maxLength={500}
              className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-h-[80px] resize-none transition-all"
            />
          </div>

          <div className="h-px bg-border/50 mx-2" />

          {/* Configuration Section */}
          <div className="space-y-5 bg-muted/30 p-5 rounded-xl border border-border/50">
            <div className="space-y-1.5">
              <label
                htmlFor="activity-folder"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1 flex justify-between items-center"
              >
                Query Activity Folder
                <span className="text-[8px] font-normal lowercase opacity-60 italic">
                  Optional
                </span>
              </label>
              <FolderTreePicker
                id="activity-folder"
                folders={folders}
                value={selectedFolderId}
                onChange={setSelectedFolderId}
                placeholder="Select folder for Query Activity..."
              />
            </div>

            <div className="space-y-1.5 relative" ref={searchRef}>
              <label
                htmlFor="activity-target-de"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1 flex justify-between items-center"
              >
                <span>
                  Target Data Extension{" "}
                  <span className="text-destructive">*</span>
                </span>
                {queryClient && folders.length > 0 ? (
                  <button
                    onClick={() => setView("creation")}
                    className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    Create New
                  </button>
                ) : null}
              </label>

              <div className="relative">
                {selectedTarget ? (
                  <div className="space-y-2">
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
                    {/* DE Details Status */}
                    {isLoadingDetails ? (
                      <p className="text-[10px] text-muted-foreground italic px-1">
                        Checking Data Extension details...
                      </p>
                    ) : targetDetails ? (
                      <p className="text-[10px] text-muted-foreground px-1">
                        {targetDetails.fieldCount} field
                        {targetDetails.fieldCount !== 1 ? "s" : ""}
                        {targetDetails.hasPrimaryKey
                          ? " \u2022 Has Primary Key"
                          : " \u2022 No Primary Key"}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="relative group">
                    <Magnifer
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors"
                    />
                    <input
                      id="activity-target-de"
                      role="combobox"
                      aria-label="Search for target Data Extension"
                      aria-expanded={isSearchFocused}
                      aria-controls="de-listbox"
                      aria-activedescendant={
                        highlightedIndex >= 0
                          ? `de-option-${highlightedIndex}`
                          : undefined
                      }
                      aria-autocomplete="list"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setIsSearchFocused(true);
                      }}
                      onFocus={() => setIsSearchFocused(true)}
                      onKeyDown={handleSearchKeyDown}
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

                {/* Dropdown Results */}
                {isSearchFocused ? (
                  <div
                    id="de-listbox"
                    role="listbox"
                    aria-label="Data Extension results"
                    className="absolute z-10 top-full mt-1 w-full bg-background border border-border rounded-lg shadow-xl max-h-[200px] overflow-y-auto overflow-x-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200"
                  >
                    {filteredTargets.length > 0 ? (
                      filteredTargets.map((de, index) => (
                        <button
                          key={de.id}
                          id={`de-option-${index}`}
                          role="option"
                          aria-selected={highlightedIndex === index}
                          onClick={() => handleSelectTarget(de)}
                          className={cn(
                            "w-full text-left px-4 py-2.5 hover:bg-primary/5 flex items-center gap-3 transition-colors border-l-2 border-transparent hover:border-primary",
                            highlightedIndex === index &&
                              "bg-primary/5 border-primary",
                          )}
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

            <div className="space-y-2.5">
              <span
                id="data-action-label"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
              >
                Data Action
              </span>
              <div
                role="radiogroup"
                aria-labelledby="data-action-label"
                aria-describedby="data-action-description"
                className="grid grid-cols-3 gap-2 p-1 bg-background/50 rounded-lg border border-border"
              >
                {(["Overwrite", "Append", "Update"] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    role="radio"
                    aria-checked={targetUpdateType === action}
                    onClick={() => setTargetUpdateType(action)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2 px-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all",
                      targetUpdateType === action
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {action}
                    {action === "Overwrite" && (
                      <span className="text-[8px] font-normal normal-case opacity-60">
                        (Default)
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p
                id="data-action-description"
                className="text-[10px] text-muted-foreground px-1 italic"
              >
                {targetUpdateType === "Overwrite" &&
                  "Destroys all existing records and replaces them with new results."}
                {targetUpdateType === "Append" &&
                  "Adds new records to the existing data. Duplicate primary key values may cause errors if the DE has constraints."}
                {targetUpdateType === "Update" &&
                  "Updates existing records based on Primary Key or inserts if missing."}
              </p>
              {targetUpdateType === "Overwrite" && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs mt-2">
                  <DangerTriangle size={16} className="shrink-0" />
                  <span>
                    <strong>Warning:</strong> Overwrite will permanently delete
                    all existing records in the target Data Extension before
                    inserting new data.
                  </span>
                </div>
              )}
              {/* Warning when Update mode selected but target DE has no PK */}
              {isPrimaryKeyMissing ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs mt-2">
                  <DangerTriangle size={16} className="shrink-0" />
                  <span>
                    <strong>Update mode requires a Primary Key.</strong> The
                    selected Data Extension does not have a Primary Key field.
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter className="bg-muted/30 px-6 py-4 border-t border-border flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
            className="text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            <Button
              disabled={!canCreate || isPending}
              onClick={() => {
                const selectedDE = localDataExtensions.find(
                  (de) => de.id === selectedTargetId,
                );
                if (!selectedDE) {
                  return;
                }
                void onSubmit?.({
                  name: activityName.trim(),
                  externalKey: externalKey.trim() || undefined,
                  description: description.trim() || undefined,
                  targetUpdateType,
                  targetDataExtensionCustomerKey: selectedDE.customerKey,
                  categoryId: selectedFolderId
                    ? parseInt(selectedFolderId, 10)
                    : undefined,
                  queryText,
                });
              }}
              className="bg-primary hover:bg-primary-600 text-primary-foreground text-xs font-bold px-6 h-10 shadow-lg shadow-primary/20 disabled:opacity-50 transition-all active:scale-95"
            >
              <Rocket size={16} weight="Bold" className="mr-2" />
              {isPending ? "Deploying..." : "Deploy Activity"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
