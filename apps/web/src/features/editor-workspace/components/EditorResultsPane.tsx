import { AltArrowUp } from "@solar-icons/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useMemo } from "react";

import { useFeature } from "@/hooks/use-feature";
import { cn } from "@/lib/utils";

import type { ExecutionResult } from "../types";
import { extractJoinConditions } from "../utils/extract-join-conditions";
import type { RelationshipGraph } from "../utils/relationship-graph";
import { FirstSaveConfirmation } from "./FirstSaveConfirmation";
import type { JoinRelationship } from "./RelationshipLightbulb";
import { RelationshipLightbulb } from "./RelationshipLightbulb";
import { ResultsPane } from "./ResultsPane";

export function EditorResultsPane(props: {
  shouldShowResultsPane: boolean;
  resultsHeight: number;
  isResizingResults: boolean;
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onToggle: () => void;
  result: ExecutionResult;
  onPageChange: (page: number) => void;
  onCancel: () => void;
  onViewInContactBuilder?: (subscriberKey: string) => void;
  executedSql?: string;
  relationshipGraph?: RelationshipGraph;
  folderId?: string;
  onSaveRelationship?: (rel: JoinRelationship) => void;
  onConfirmFirstSave?: (pending: {
    sourceDE: string;
    sourceColumn: string;
    targetDE: string;
    targetColumn: string;
    folderId: string;
  }) => void;
}) {
  const {
    shouldShowResultsPane,
    resultsHeight,
    isResizingResults,
    onResizeStart,
    onToggle,
    result,
    onPageChange,
    onCancel,
    onViewInContactBuilder,
    executedSql,
    relationshipGraph,
    folderId,
    onSaveRelationship,
    onConfirmFirstSave,
  } = props;

  const { enabled: isSmartRelEnabled } = useFeature("smartRelationships");

  const queryRelationships: JoinRelationship[] = useMemo(() => {
    if (!isSmartRelEnabled || !executedSql || result.status !== "success") {
      return [];
    }
    return extractJoinConditions(executedSql).map((c) => ({
      sourceDE: c.leftTable,
      sourceColumn: c.leftColumn,
      targetDE: c.rightTable,
      targetColumn: c.rightColumn,
    }));
  }, [isSmartRelEnabled, executedSql, result.status]);

  return (
    <div
      className={cn(
        "border-t border-border bg-background flex flex-col min-h-[32px]",
        isResizingResults
          ? "transition-none"
          : "transition-[height] duration-300 ease-out",
      )}
      style={{
        height: shouldShowResultsPane ? resultsHeight : 32,
      }}
    >
      {shouldShowResultsPane ? (
        <>
          <div
            onPointerDown={onResizeStart}
            className="h-2 cursor-row-resize bg-border/40 hover:bg-border transition-colors"
          >
            <div className="mx-auto mt-0.5 h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>
          {queryRelationships.length > 0 &&
          relationshipGraph &&
          folderId &&
          onSaveRelationship ? (
            <RelationshipLightbulb
              queryRelationships={queryRelationships}
              graph={relationshipGraph}
              folderId={folderId}
              onSave={onSaveRelationship}
            />
          ) : null}
          {onConfirmFirstSave ? (
            <FirstSaveConfirmation onConfirmSave={onConfirmFirstSave} />
          ) : null}
          <div className="flex-1 min-h-0">
            <ResultsPane
              result={result}
              onPageChange={onPageChange}
              onCancel={onCancel}
              onViewInContactBuilder={() => {
                const subscriberKey = result.rows[0]?.SubscriberKey;
                if (typeof subscriberKey === "string") {
                  onViewInContactBuilder?.(subscriberKey);
                }
              }}
            />
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className="h-full w-full flex items-center justify-between px-4 bg-card/60 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>Run a query to see results</span>
          <AltArrowUp size={14} />
        </button>
      )}
    </div>
  );
}
