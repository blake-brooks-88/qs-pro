import * as HoverCard from "@radix-ui/react-hover-card";
import { Copy } from "@solar-icons/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

import { useRunSqlText } from "../hooks/use-execution-history";

interface SqlPreviewHoverCardProps {
  runId: string;
  hasSql: boolean;
  onOpenInNewTab: (sql: string) => void;
  children: React.ReactNode;
}

export function SqlPreviewHoverCard({
  runId,
  hasSql,
  onOpenInNewTab,
  children,
}: SqlPreviewHoverCardProps) {
  const [open, setOpen] = useState(false);
  const { data: fullSql, refetch, isFetching } = useRunSqlText(runId);

  useEffect(() => {
    if (open && hasSql && !fullSql) {
      void refetch();
    }
  }, [open, hasSql, fullSql, refetch]);

  const handleCopy = useCallback(() => {
    if (!fullSql) {
      return;
    }

    void copyToClipboard(fullSql).then((didCopy) => {
      if (didCopy) {
        toast.success("SQL copied to clipboard");
      } else {
        toast.error("Unable to copy SQL");
      }
    });
  }, [fullSql]);

  const handleDoubleClick = useCallback(() => {
    if (!hasSql) {
      return;
    }

    if (fullSql) {
      onOpenInNewTab(fullSql);
      return;
    }

    void refetch().then((result) => {
      if (result.data) {
        onOpenInNewTab(result.data);
      } else {
        toast.error("Unable to retrieve SQL");
      }
    });
  }, [hasSql, fullSql, refetch, onOpenInNewTab]);

  if (!hasSql) {
    return <>{children}</>;
  }

  return (
    <HoverCard.Root
      openDelay={200}
      closeDelay={300}
      open={open}
      onOpenChange={setOpen}
    >
      <HoverCard.Trigger asChild>
        <button
          type="button"
          className="cursor-pointer select-none bg-transparent border-0 p-0 text-left"
          onDoubleClick={handleDoubleClick}
        >
          {children}
        </button>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          className="z-50 max-w-md rounded-md border border-border bg-popover p-3 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 cursor-pointer select-none"
          side="bottom"
          sideOffset={5}
          collisionPadding={16}
          avoidCollisions
          onDoubleClick={handleDoubleClick}
        >
          <div className="relative">
            {isFetching && !fullSql ? (
              <div className="space-y-2">
                <div className="h-3 w-full rounded-sm bg-muted animate-pulse" />
                <div className="h-3 w-3/4 rounded-sm bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded-sm bg-muted animate-pulse" />
              </div>
            ) : fullSql ? (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCopy();
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                  }}
                  className={cn(
                    "absolute right-0 top-0 rounded p-1 transition-colors",
                    "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                  aria-label="Copy SQL"
                >
                  <Copy size={14} />
                </button>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all pr-6 font-mono text-xs text-popover-foreground">
                  {fullSql}
                </pre>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">SQL unavailable</p>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Double-click to open in new tab
          </p>
          <HoverCard.Arrow className="fill-popover" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
