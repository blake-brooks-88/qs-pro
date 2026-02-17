import Editor, { DiffEditor } from "@monaco-editor/react";
import type { AutomationInfo } from "@qpp/shared-types";
import { InfoCircle } from "@solar-icons/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getEditorOptions,
  MONACO_THEME_NAME,
} from "@/features/editor-workspace/utils/monaco-options";

interface PublishConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  qaName: string;
  currentAsSql: string | null;
  versionSql: string;
  automations: AutomationInfo[];
  isLoadingBlastRadius: boolean;
  blastRadiusError?: boolean;
  blastRadiusPartial?: boolean;
}

const HIGH_RISK_STATUSES = new Set([
  "Running",
  "Scheduled",
  "Awaiting Trigger",
]);

function automationStatusColor(status: string, isHighRisk: boolean): string {
  if (isHighRisk || HIGH_RISK_STATUSES.has(status)) {
    return "text-amber-500";
  }
  return "text-muted-foreground";
}

export function PublishConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  isPending,
  qaName,
  currentAsSql,
  versionSql,
  automations,
  isLoadingBlastRadius,
  blastRadiusError,
  blastRadiusPartial,
}: PublishConfirmationDialogProps) {
  const baseOptions = getEditorOptions();

  const diffOptions = {
    ...baseOptions,
    readOnly: true,
    renderSideBySide: true,
    renderIndicators: true,
    renderOverviewRuler: false,
    renderMarginRevertIcon: false,
    ignoreTrimWhitespace: true,
    originalEditable: false,
    enableSplitViewResizing: false,
    hideUnchangedRegions: { enabled: false },
    minimap: { enabled: false },
    lineNumbers: "on" as const,
    scrollBeyondLastLine: false,
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !isPending && onClose()}
    >
      <DialogContent
        className="max-w-4xl bg-card border-border p-0 overflow-hidden"
        onInteractOutside={(e) => isPending && e.preventDefault()}
        onEscapeKeyDown={(e) => isPending && e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-display text-lg font-bold">
            Publish to Automation Studio
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Publish query &ldquo;{qaName}&rdquo; to its linked Query Activity in
            Automation Studio.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          {currentAsSql !== null ? (
            <>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                <span>Currently in AS</span>
                <span>Version to Publish</span>
              </div>
              <div className="h-[300px] border border-border rounded-lg overflow-hidden">
                <DiffEditor
                  height="100%"
                  language="sql"
                  original={currentAsSql}
                  modified={versionSql}
                  theme={MONACO_THEME_NAME}
                  options={diffOptions}
                />
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                SQL to Publish
              </div>
              <div className="h-[300px] border border-border rounded-lg overflow-hidden">
                <Editor
                  height="100%"
                  defaultLanguage="sql"
                  value={versionSql}
                  theme={MONACO_THEME_NAME}
                  options={{
                    ...baseOptions,
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
            </>
          )}

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Blast Radius
            </h4>
            {isLoadingBlastRadius ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <span className="h-3 w-3 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
                Loading automations...
              </div>
            ) : blastRadiusError ? (
              <p className="text-xs text-destructive py-2">
                Unable to load automation data. Proceed with caution.
              </p>
            ) : automations.length === 0 ? (
              <>
                {blastRadiusPartial ? (
                  <p className="text-xs text-amber-500 py-2">
                    Some automation detail requests failed. This result may be
                    incomplete—proceed with caution.
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground py-2">
                  No automations use this Query Activity.
                </p>
              </>
            ) : (
              <>
                {blastRadiusPartial ? (
                  <p className="text-xs text-amber-500 py-2">
                    Some automation detail requests failed. This list may be
                    incomplete—proceed with caution.
                  </p>
                ) : null}
                <ul className="space-y-1">
                  {automations.map((automation) => (
                    <li
                      key={automation.id}
                      className="flex items-center gap-2 text-xs py-1"
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                          automation.isHighRisk
                            ? "bg-amber-500"
                            : "bg-muted-foreground"
                        }`}
                      />
                      <span className="font-medium text-foreground">
                        {automation.name}
                      </span>
                      <span
                        className={`${automationStatusColor(automation.status, automation.isHighRisk)} font-medium`}
                      >
                        {automation.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <InfoCircle size={14} className="shrink-0 text-primary mt-px" />
            <span>
              This Query Activity may have been edited directly in Automation
              Studio.
            </span>
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
          <Button
            onClick={onConfirm}
            disabled={isPending}
            className="text-xs font-bold"
          >
            {isPending ? "Publishing..." : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
