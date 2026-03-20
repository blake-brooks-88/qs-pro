import {
  AltArrowDown,
  AltArrowRight,
  CheckCircle,
  CloseCircle,
  LinkMinimalistic,
} from "@solar-icons/react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import {
  useDeleteRelationship,
  useDismissRelationship,
  useSaveRelationship,
} from "../hooks/use-relationship-config";
import type {
  RelationshipEdge,
  RelationshipGraph,
} from "../utils/relationship-graph/types";

interface RelationshipSectionProps {
  deName: string;
  graph: RelationshipGraph;
  onNavigateToDE: (deName: string) => void;
}

function getEdgesForDE(
  edges: RelationshipEdge[],
  deName: string,
): Array<RelationshipEdge & { linkedDE: string; displayColumns: string }> {
  return edges
    .filter((e) => e.sourceDE === deName || e.targetDE === deName)
    .map((edge) => {
      const isSource = edge.sourceDE === deName;
      const linkedDE = isSource ? edge.targetDE : edge.sourceDE;
      const localCol = isSource ? edge.sourceColumn : edge.targetColumn;
      const remoteCol = isSource ? edge.targetColumn : edge.sourceColumn;
      const displayColumns =
        localCol.toLowerCase() === remoteCol.toLowerCase()
          ? `via ${localCol}`
          : `via ${localCol} \u2192 ${remoteCol}`;

      return { ...edge, linkedDE, displayColumns };
    });
}

function InlineConfirmation({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <span className="text-xs text-muted-foreground">
      Remove for team?{" "}
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        Cancel
      </button>{" "}
      <button
        type="button"
        onClick={onConfirm}
        className="text-xs text-destructive hover:text-destructive/80 underline"
      >
        Remove
      </button>
    </span>
  );
}

function ConfirmedRelationships({
  edges,
  onNavigateToDE,
}: {
  edges: Array<RelationshipEdge & { linkedDE: string; displayColumns: string }>;
  onNavigateToDE: (deName: string) => void;
}) {
  const [confirmingRuleId, setConfirmingRuleId] = useState<string | null>(null);
  const deleteMutation = useDeleteRelationship();

  if (edges.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      {edges.map((edge) => {
        const key = `${edge.sourceDE}:${edge.sourceColumn}:${edge.targetDE}:${edge.targetColumn}`;
        const isConfirming = confirmingRuleId === (edge.ruleId ?? key);

        return (
          <div
            key={key}
            className="group flex items-center gap-1.5 py-0.5 text-xs"
          >
            {isConfirming ? (
              <InlineConfirmation
                onConfirm={() => {
                  if (edge.ruleId) {
                    deleteMutation.mutate(edge.ruleId);
                  }
                  setConfirmingRuleId(null);
                }}
                onCancel={() => setConfirmingRuleId(null)}
              />
            ) : (
              <>
                <LinkMinimalistic
                  size={12}
                  className="text-muted-foreground/70 shrink-0"
                />
                <button
                  type="button"
                  onClick={() => onNavigateToDE(edge.linkedDE)}
                  className="text-xs text-primary/80 hover:text-primary hover:underline truncate"
                  title={`Navigate to ${edge.linkedDE}`}
                >
                  {edge.linkedDE}
                </button>
                <span className="text-muted-foreground/60 text-xs truncate">
                  {edge.displayColumns}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmingRuleId(edge.ruleId ?? key)}
                  className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                  aria-label={`Remove relationship with ${edge.linkedDE}`}
                  title="Remove"
                >
                  <CloseCircle size={12} />
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SuggestedRelationships({
  edges,
  onNavigateToDE,
}: {
  edges: Array<RelationshipEdge & { linkedDE: string; displayColumns: string }>;
  onNavigateToDE: (deName: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const saveMutation = useSaveRelationship();
  const dismissMutation = useDismissRelationship();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleEdges = edges.filter((edge) => {
    const key = `${edge.sourceDE}:${edge.sourceColumn}:${edge.targetDE}:${edge.targetColumn}`;
    return !dismissed.has(key);
  });

  if (visibleEdges.length === 0) {
    return null;
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full py-0.5"
      >
        {isExpanded ? (
          <AltArrowDown size={12} className="shrink-0" />
        ) : (
          <AltArrowRight size={12} className="shrink-0" />
        )}
        <span>
          {visibleEdges.length} suggested relationship
          {visibleEdges.length !== 1 ? "s" : ""}
        </span>
      </button>
      {isExpanded ? (
        <div className="ml-3 border-l border-indigo-500/20 pl-2 space-y-0.5 mt-0.5">
          {visibleEdges.map((edge) => {
            const key = `${edge.sourceDE}:${edge.sourceColumn}:${edge.targetDE}:${edge.targetColumn}`;

            return (
              <div
                key={key}
                className="group flex items-center gap-1.5 py-0.5 text-xs transition-all duration-300"
              >
                <LinkMinimalistic
                  size={12}
                  className="text-indigo-400/70 shrink-0"
                />
                <button
                  type="button"
                  onClick={() => onNavigateToDE(edge.linkedDE)}
                  className="text-xs text-primary/80 hover:text-primary hover:underline truncate"
                  title={`Navigate to ${edge.linkedDE}`}
                >
                  {edge.linkedDE}
                </button>
                <span className="text-muted-foreground/60 text-xs truncate">
                  {edge.displayColumns}
                </span>
                <span className="ml-auto flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      saveMutation.mutate({
                        ruleType: "explicit_link",
                        sourceDE: edge.sourceDE,
                        sourceColumn: edge.sourceColumn,
                        targetDE: edge.targetDE,
                        targetColumn: edge.targetColumn,
                      })
                    }
                    className="p-0.5 rounded text-green-500/70 hover:text-green-400 hover:bg-green-500/10 transition-colors"
                    aria-label={`Confirm relationship with ${edge.linkedDE}`}
                    title="Confirm"
                  >
                    <CheckCircle size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      dismissMutation.mutate({
                        sourceDE: edge.sourceDE,
                        sourceColumn: edge.sourceColumn,
                        targetDE: edge.targetDE,
                        targetColumn: edge.targetColumn,
                      });
                      setDismissed((prev) => new Set(prev).add(key));
                    }}
                    className="p-0.5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label={`Dismiss relationship with ${edge.linkedDE}`}
                    title="Dismiss"
                  >
                    <CloseCircle size={14} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function RelationshipSection({
  deName,
  graph,
  onNavigateToDE,
}: RelationshipSectionProps) {
  const allEdges = getEdgesForDE(graph.edges, deName);
  const confirmedEdges = allEdges.filter((e) => e.confidence === "confirmed");
  const suggestedEdges = allEdges.filter((e) => e.confidence !== "confirmed");

  if (allEdges.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "pb-1.5 mb-1",
        confirmedEdges.length > 0 && "border-b border-border/30",
      )}
    >
      <ConfirmedRelationships
        edges={confirmedEdges}
        onNavigateToDE={onNavigateToDE}
      />
      <SuggestedRelationships
        edges={suggestedEdges}
        onNavigateToDE={onNavigateToDE}
      />
    </div>
  );
}
