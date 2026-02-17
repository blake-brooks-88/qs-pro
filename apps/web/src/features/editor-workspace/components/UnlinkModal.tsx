import type { AutomationInfo } from "@qpp/shared-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBlastRadius } from "@/features/editor-workspace/hooks/use-blast-radius";
import { useUnlinkQuery } from "@/features/editor-workspace/hooks/use-link-query";
import { cn } from "@/lib/utils";

type UnlinkOption =
  | "unlink-only"
  | "delete-local"
  | "delete-remote"
  | "delete-both";

interface UnlinkModalProps {
  open: boolean;
  onClose: () => void;
  savedQueryId: string;
  savedQueryName: string;
  linkedQaName: string;
  linkedQaCustomerKey: string;
  onUnlinkComplete: (options: {
    deleteLocal: boolean;
    deleteRemote: boolean;
  }) => void;
}

const OPTION_META: Record<
  UnlinkOption,
  { label: string; description: string }
> = {
  "unlink-only": {
    label: "Unlink only (keep both)",
    description:
      "Remove the connection. Both the Q++ query and AS Query Activity remain.",
  },
  "delete-local": {
    label: "Unlink + delete Q++ query",
    description:
      "Remove the connection and delete your saved query from Query++.",
  },
  "delete-remote": {
    label: "Unlink + delete AS Query Activity",
    description:
      "Remove the connection and delete the Query Activity from Automation Studio.",
  },
  "delete-both": {
    label: "Unlink + delete both",
    description: "Remove the connection and delete both resources.",
  },
};

const OPTION_ORDER: UnlinkOption[] = [
  "unlink-only",
  "delete-local",
  "delete-remote",
  "delete-both",
];

function determineSafetyTier(automations: AutomationInfo[]): 1 | 2 | 3 {
  if (automations.length === 0) {
    return 1;
  }
  const hasHighRisk = automations.some((a) => a.isHighRisk);
  return hasHighRisk ? 3 : 2;
}

export function UnlinkModal({
  open,
  onClose,
  savedQueryId,
  savedQueryName,
  linkedQaName,
  linkedQaCustomerKey: _linkedQaCustomerKey,
  onUnlinkComplete,
}: UnlinkModalProps) {
  const [selectedOption, setSelectedOption] =
    useState<UnlinkOption>("unlink-only");
  const [confirmInput, setConfirmInput] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const unlinkMutation = useUnlinkQuery();

  const showsBlastRadius =
    selectedOption === "delete-remote" || selectedOption === "delete-both";

  const blastRadius = useBlastRadius(
    open && showsBlastRadius ? savedQueryId : undefined,
  );

  const blastRadiusPartial = blastRadius.data?.partial === true;

  const automations = useMemo(
    () => blastRadius.data?.automations ?? [],
    [blastRadius.data?.automations],
  );
  const safetyTier = useMemo(
    () => determineSafetyTier(automations),
    [automations],
  );

  const effectiveSafetyTier = useMemo(
    () =>
      showsBlastRadius && (blastRadius.isError || blastRadiusPartial)
        ? Math.max(safetyTier, 2)
        : safetyTier,
    [showsBlastRadius, blastRadius.isError, blastRadiusPartial, safetyTier],
  );

  const highRiskCount = useMemo(
    () => automations.filter((a) => a.isHighRisk).length,
    [automations],
  );

  useEffect(() => {
    if (!open) {
      setSelectedOption("unlink-only");
      setConfirmInput("");
      setAcknowledged(false);
    }
  }, [open]);

  useEffect(() => {
    setConfirmInput("");
    setAcknowledged(false);
  }, [selectedOption]);

  const isDestructive = selectedOption !== "unlink-only";

  const isConfirmEnabled = useMemo(() => {
    if (unlinkMutation.isPending) {
      return false;
    }

    if (!showsBlastRadius) {
      return true;
    }

    if (blastRadius.isLoading) {
      return false;
    }

    if (effectiveSafetyTier === 1) {
      return true;
    }

    const nameMatches = confirmInput === linkedQaName;

    if (effectiveSafetyTier === 2) {
      return nameMatches;
    }

    return nameMatches && acknowledged;
  }, [
    unlinkMutation.isPending,
    showsBlastRadius,
    blastRadius.isLoading,
    effectiveSafetyTier,
    confirmInput,
    linkedQaName,
    acknowledged,
  ]);

  const handleConfirm = useCallback(() => {
    const deleteLocal =
      selectedOption === "delete-local" || selectedOption === "delete-both";
    const deleteRemote =
      selectedOption === "delete-remote" || selectedOption === "delete-both";

    void unlinkMutation
      .mutateAsync({
        savedQueryId,
        options: { deleteLocal, deleteRemote },
      })
      .then(() => {
        toast.success("Query unlinked successfully");
        onUnlinkComplete({ deleteLocal, deleteRemote });
        onClose();
      })
      .catch(() => {
        toast.error("Failed to unlink query");
      });
  }, [selectedOption, savedQueryId, unlinkMutation, onUnlinkComplete, onClose]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !unlinkMutation.isPending) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-lg bg-card border-border p-0 overflow-hidden"
        onInteractOutside={(e) =>
          unlinkMutation.isPending && e.preventDefault()
        }
        onEscapeKeyDown={(e) => unlinkMutation.isPending && e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-display text-lg font-bold">
            Unlink Query Activity
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Disconnect &ldquo;{savedQueryName}&rdquo; from &ldquo;{linkedQaName}
            &rdquo; in Automation Studio.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          {/* Radio group */}
          <div
            className="space-y-2"
            role="radiogroup"
            aria-label="Unlink options"
          >
            {OPTION_ORDER.map((option) => {
              /* eslint-disable security/detect-object-injection -- option is from the constant OPTION_ORDER array */
              const meta = OPTION_META[option];
              /* eslint-enable security/detect-object-injection */
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selectedOption === option}
                  onClick={() => setSelectedOption(option)}
                  disabled={unlinkMutation.isPending}
                  className={cn(
                    "w-full flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors text-left",
                    selectedOption === option
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30",
                    unlinkMutation.isPending &&
                      "opacity-50 pointer-events-none",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center",
                      selectedOption === option
                        ? "border-primary"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {selectedOption === option ? (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    ) : null}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-foreground">
                      {meta.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {meta.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Safety section */}
          {showsBlastRadius ? (
            <div className="space-y-3 border-t border-border pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Blast Radius
              </h4>

              {blastRadius.isLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <span className="h-3 w-3 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
                  Loading automations...
                </div>
              ) : blastRadius.isError ? (
                <>
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    Unable to verify automation usage. Name confirmation
                    required as a safety precaution.
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="unlink-confirm-input"
                      className="text-xs text-muted-foreground"
                    >
                      Type the Query Activity name (
                      <span className="font-bold text-foreground">
                        {linkedQaName}
                      </span>
                      ) to confirm deletion
                    </label>
                    <input
                      id="unlink-confirm-input"
                      type="text"
                      value={confirmInput}
                      onChange={(e) => setConfirmInput(e.target.value)}
                      disabled={unlinkMutation.isPending}
                      autoComplete="off"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                      placeholder={linkedQaName}
                    />
                  </div>
                </>
              ) : (
                <>
                  {blastRadiusPartial ? (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600">
                      Some automation detail requests failed. Treat this result
                      as incomplete and confirm the Query Activity name before
                      deleting.
                    </div>
                  ) : null}
                  {effectiveSafetyTier === 1 ? (
                    <p className="text-xs text-muted-foreground py-1">
                      This Query Activity is not used by any automations.
                    </p>
                  ) : (
                    <>
                      <ul className="space-y-1">
                        {automations.map((automation) => (
                          <li
                            key={automation.id}
                            className="flex items-center gap-2 text-xs py-1"
                          >
                            <span
                              className={cn(
                                "inline-block h-1.5 w-1.5 rounded-full shrink-0",
                                automation.isHighRisk
                                  ? "bg-amber-500"
                                  : "bg-muted-foreground",
                              )}
                            />
                            <span className="font-medium text-foreground">
                              {automation.name}
                            </span>
                            <span
                              className={cn(
                                "font-medium",
                                automation.isHighRisk
                                  ? "text-amber-500"
                                  : "text-muted-foreground",
                              )}
                            >
                              {automation.status}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {/* Type-to-confirm (Tier 2+) */}
                      <div className="space-y-1.5">
                        <label
                          htmlFor="unlink-confirm-input"
                          className="text-xs text-muted-foreground"
                        >
                          Type the Query Activity name (
                          <span className="font-bold text-foreground">
                            {linkedQaName}
                          </span>
                          ) to confirm deletion
                        </label>
                        <input
                          id="unlink-confirm-input"
                          type="text"
                          value={confirmInput}
                          onChange={(e) => setConfirmInput(e.target.value)}
                          disabled={unlinkMutation.isPending}
                          autoComplete="off"
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                          placeholder={linkedQaName}
                        />
                      </div>

                      {/* Tier 3: Acknowledgment checkbox */}
                      {effectiveSafetyTier === 3 ? (
                        <label
                          htmlFor="unlink-acknowledge-checkbox"
                          className="flex items-start gap-2 cursor-pointer"
                        >
                          <input
                            id="unlink-acknowledge-checkbox"
                            type="checkbox"
                            checked={acknowledged}
                            onChange={(e) => setAcknowledged(e.target.checked)}
                            disabled={unlinkMutation.isPending}
                            className="mt-0.5 accent-primary"
                          />
                          <span className="text-xs text-amber-500 font-medium">
                            I understand this will affect {highRiskCount} active
                            automation{highRiskCount !== 1 ? "s" : ""}
                          </span>
                        </label>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter className="bg-muted/30 px-6 py-4 border-t border-border flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={unlinkMutation.isPending}
            className="text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            variant={isDestructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
            className="text-xs font-bold"
          >
            {unlinkMutation.isPending
              ? "Unlinking..."
              : isDestructive
                ? "Unlink & Delete"
                : "Unlink"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
