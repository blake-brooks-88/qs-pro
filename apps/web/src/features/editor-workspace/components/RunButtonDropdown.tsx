import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Database, MenuDots, Play } from "@solar-icons/react";

import { FeatureGate } from "@/components/FeatureGate";
import { cn } from "@/lib/utils";

interface RunButtonDropdownProps {
  onRun: () => void;
  onRunToTarget: () => void;
  isRunning: boolean;
  disabled: boolean;
  tooltipMessage?: string;
}

export function RunButtonDropdown({
  onRun,
  onRunToTarget,
  isRunning,
  disabled,
  tooltipMessage = "Execute SQL (Ctrl+Enter)",
}: RunButtonDropdownProps) {
  const isDisabled = disabled || isRunning;

  return (
    <div className="flex items-center">
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            className={cn("inline-flex", isDisabled && "cursor-not-allowed")}
          >
            <button
              onClick={onRun}
              disabled={isDisabled}
              data-testid="run-button"
              className={cn(
                "flex items-center gap-2 bg-success text-success-foreground h-8 px-4 rounded-l-md text-xs font-bold transition-all shadow-lg shadow-success/20 active:scale-95",
                isDisabled
                  ? "opacity-60 cursor-not-allowed shadow-none"
                  : "hover:brightness-110",
              )}
            >
              {isRunning ? (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-success-foreground border-t-transparent"
                  data-testid="run-spinner"
                />
              ) : (
                <Play size={16} weight="Bold" />
              )}
              RUN
            </button>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50"
            sideOffset={5}
          >
            {tooltipMessage}
            <Tooltip.Arrow className="fill-foreground" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className={cn(
              "h-8 px-2 bg-success brightness-90 text-success-foreground border-l border-black/10 rounded-r-md active:scale-95",
              isDisabled
                ? "opacity-60 cursor-not-allowed"
                : "hover:brightness-100",
            )}
            disabled={isDisabled}
            data-testid="run-dropdown-trigger"
          >
            <MenuDots size={14} weight="Bold" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="min-w-[200px] bg-card border border-border rounded-lg shadow-xl p-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
            sideOffset={5}
            align="start"
          >
            <FeatureGate feature="runToTargetDE" variant="button">
              <DropdownMenu.Item
                className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-md cursor-pointer outline-none transition-colors hover:bg-primary/10 focus:bg-primary/10 data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
                onSelect={onRunToTarget}
                data-testid="run-to-target-option"
              >
                <Database size={16} className="text-primary" />
                <div>
                  <p className="font-semibold">Run to Target DE</p>
                  <p className="text-[10px] text-muted-foreground">
                    Write results to existing Data Extension
                  </p>
                </div>
              </DropdownMenu.Item>
            </FeatureGate>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
