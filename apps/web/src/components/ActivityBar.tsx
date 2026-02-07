import * as Tooltip from "@radix-ui/react-tooltip";
import { ClockCircle, Database, Folder2 } from "@solar-icons/react";

import {
  type ActivityView,
  useActivityBarStore,
} from "@/features/editor-workspace/store/activity-bar-store";
import { cn } from "@/lib/utils";

const items: {
  view: ActivityView;
  label: string;
  Icon: typeof Database;
}[] = [
  { view: "dataExtensions", label: "Data Extensions", Icon: Database },
  { view: "queries", label: "Queries", Icon: Folder2 },
  { view: "history", label: "Execution History", Icon: ClockCircle },
];

export function ActivityBar() {
  const activeView = useActivityBarStore((s) => s.activeView);
  const toggleView = useActivityBarStore((s) => s.toggleView);

  return (
    <div className="w-12 border-r border-border bg-background flex flex-col items-center pt-3 gap-1 shrink-0">
      {items.map(({ view, label, Icon }) => {
        const isActive = activeView === view;
        return (
          <Tooltip.Root key={view}>
            <Tooltip.Trigger asChild>
              <button
                onClick={() => toggleView(view)}
                className={cn(
                  "w-full flex items-center justify-center py-3 transition-colors relative",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {isActive ? (
                  <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-r" />
                ) : null}
                <Icon size={22} weight={isActive ? "Bold" : "Linear"} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50 font-bold uppercase tracking-tight"
                sideOffset={5}
              >
                {label}
                <Tooltip.Arrow className="fill-foreground" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        );
      })}
    </div>
  );
}
