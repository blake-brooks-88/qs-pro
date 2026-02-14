import * as Tooltip from "@radix-ui/react-tooltip";
import {
  ClockCircle,
  Code,
  Database,
  Diskette,
  Download,
  Export,
  History,
  Import,
  LinkBrokenMinimalistic,
  LinkMinimalistic,
  Rocket,
} from "@solar-icons/react";
import type { ReactNode } from "react";

import { FeatureGate } from "@/components/FeatureGate";
import { cn } from "@/lib/utils";

import { LinkedBadge } from "./LinkedBadge";
import { RunButtonDropdown } from "./RunButtonDropdown";

export function EditorToolbar(props: {
  activeTab: {
    name: string;
    isDirty: boolean;
    queryId?: string;
    linkedQaCustomerKey?: string | null;
    linkedQaName?: string | null;
  };
  runButton: {
    onRun: () => void;
    onRunToTarget: () => void;
    isRunning: boolean;
    disabled: boolean;
    tooltipMessage: string;
  };
  onSave: () => void;
  onFormat?: () => void;
  onCreateDE: () => void;
  onOpenImport: () => void;
  isDeployFeatureEnabled: boolean;
  onViewRunHistory: (queryId: string) => void;
  onOpenVersionHistory: () => void;
  onPublish: () => void;
  isPublishing: boolean;
  automationCount: number | null;
  onUnlink: (queryId: string) => void;
  onLink: (queryId: string) => void;
  onCreateInAS: () => void;
}) {
  const {
    activeTab,
    runButton,
    onSave,
    onFormat,
    onCreateDE,
    onOpenImport,
    isDeployFeatureEnabled,
    onViewRunHistory,
    onOpenVersionHistory,
    onPublish,
    isPublishing,
    automationCount,
    onUnlink,
    onLink,
    onCreateInAS,
  } = props;

  return (
    <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0 overflow-visible">
      <div className="flex items-center gap-4">
        <RunButtonDropdown
          onRun={runButton.onRun}
          onRunToTarget={runButton.onRunToTarget}
          isRunning={runButton.isRunning}
          disabled={runButton.disabled}
          tooltipMessage={runButton.tooltipMessage}
        />

        <div className="h-4 w-px bg-border mx-1" />

        <div className="flex items-center gap-1 overflow-visible">
          <ToolbarButton
            icon={<Diskette size={18} />}
            label={activeTab.isDirty ? "Save Changes*" : "Save Query"}
            onClick={onSave}
            className={activeTab.isDirty ? "text-primary" : ""}
          />
          <ToolbarButton
            icon={<Code size={18} />}
            label="Format SQL"
            onClick={onFormat}
          />
          <ToolbarButton icon={<Download size={18} />} label="Export Results" />

          <div className="h-4 w-px bg-border mx-1" />

          <FeatureGate feature="createDataExtension" variant="button">
            <ToolbarButton
              icon={<Database size={18} />}
              label="Create Data Extension"
              onClick={onCreateDE}
              className="text-primary hover:text-primary-foreground hover:bg-primary"
            />
          </FeatureGate>

          {isDeployFeatureEnabled ? (
            <>
              <div className="h-4 w-px bg-border mx-1" />
              <ToolbarButton
                icon={<Import size={18} />}
                label="Import from Automation Studio"
                onClick={onOpenImport}
              />
            </>
          ) : null}

          {activeTab.queryId ? (
            <>
              <div className="h-4 w-px bg-border mx-1" />
              <ToolbarButton
                icon={<ClockCircle size={18} />}
                label="View Run History"
                onClick={() => onViewRunHistory(activeTab.queryId as string)}
              />
              <ToolbarButton
                icon={<History size={18} />}
                label="Version History"
                onClick={onOpenVersionHistory}
              />

              {isDeployFeatureEnabled ? (
                <>
                  <div className="h-4 w-px bg-border mx-1" />
                  {activeTab.linkedQaCustomerKey ? (
                    <>
                      <LinkedBadge
                        size="md"
                        qaName={activeTab.linkedQaName}
                        automationCount={automationCount}
                      />
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button
                            onClick={onPublish}
                            disabled={isPublishing}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground rounded-md transition-all active:scale-95 disabled:opacity-50"
                          >
                            <Export size={16} />
                            Publish
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content
                            className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50 font-bold uppercase tracking-tight"
                            sideOffset={5}
                            collisionPadding={10}
                          >
                            Push SQL to linked Query Activity
                            <Tooltip.Arrow className="fill-foreground" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                      <ToolbarButton
                        icon={<LinkBrokenMinimalistic size={18} />}
                        label="Unlink from Query Activity"
                        onClick={() => onUnlink(activeTab.queryId as string)}
                      />
                    </>
                  ) : (
                    <ToolbarButton
                      icon={<LinkMinimalistic size={18} />}
                      label="Link to Query Activity"
                      onClick={() => onLink(activeTab.queryId as string)}
                    />
                  )}
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3 overflow-visible">
        <div className="hidden sm:flex flex-col items-end mr-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Active Tab
          </span>
          <span className="text-[10px] font-bold text-primary flex items-center gap-1">
            {activeTab.name}
            {activeTab.isDirty ? (
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            ) : null}
          </span>
        </div>

        <FeatureGate feature="deployToAutomation" variant="button">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={onCreateInAS}
                className="flex items-center gap-2 border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground h-8 px-4 rounded-md text-xs font-bold transition-all group active:scale-95"
              >
                <Rocket
                  size={16}
                  weight="Bold"
                  className="group-hover:animate-bounce"
                />
                Create in AS
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50"
                sideOffset={5}
              >
                Create permanent MCE Activity
                <Tooltip.Arrow className="fill-foreground" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </FeatureGate>
      </div>
    </div>
  );
}

function ToolbarButton(props: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  const { icon, label, onClick, className } = props;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all active:scale-95",
            className,
          )}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50 font-bold uppercase tracking-tight"
          sideOffset={5}
          collisionPadding={10}
        >
          {label}
          <Tooltip.Arrow className="fill-foreground" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
