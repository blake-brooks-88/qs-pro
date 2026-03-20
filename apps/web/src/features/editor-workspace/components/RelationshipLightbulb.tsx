import { Lightbulb } from "@solar-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { RelationshipGraph } from "@/features/editor-workspace/utils/relationship-graph";

import { useRelationshipStore } from "../store/relationship-store";

const EXIT_ANIMATION_MS = 300;

export interface JoinRelationship {
  sourceDE: string;
  sourceColumn: string;
  targetDE: string;
  targetColumn: string;
}

interface RelationshipLightbulbProps {
  queryRelationships: JoinRelationship[];
  graph: RelationshipGraph;
  onSave: (rel: JoinRelationship) => void;
}

function isConfirmedInGraph(
  rel: JoinRelationship,
  graph: RelationshipGraph,
): boolean {
  return graph.edges.some(
    (e) =>
      e.confidence === "confirmed" &&
      ((e.sourceDE === rel.sourceDE &&
        e.sourceColumn === rel.sourceColumn &&
        e.targetDE === rel.targetDE &&
        e.targetColumn === rel.targetColumn) ||
        (e.sourceDE === rel.targetDE &&
          e.sourceColumn === rel.targetColumn &&
          e.targetDE === rel.sourceDE &&
          e.targetColumn === rel.sourceColumn)),
  );
}

export function RelationshipLightbulb({
  queryRelationships,
  graph,
  onSave,
}: RelationshipLightbulbProps) {
  const isDismissedForSession = useRelationshipStore(
    (s) => s.isDismissedForSession,
  );
  const dismissForSession = useRelationshipStore((s) => s.dismissForSession);
  const configDEConfirmed = useRelationshipStore((s) => s.configDEConfirmed);
  const openFirstSaveDialog = useRelationshipStore(
    (s) => s.openFirstSaveDialog,
  );

  const unsaved = useMemo(
    () =>
      queryRelationships.filter(
        (r) =>
          !isConfirmedInGraph(r, graph) &&
          !isDismissedForSession(
            r.sourceDE,
            r.sourceColumn,
            r.targetDE,
            r.targetColumn,
          ),
      ),
    [queryRelationships, graph, isDismissedForSession],
  );

  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [exitingKeys, setExitingKeys] = useState<Set<string>>(new Set());

  const makeKey = (r: JoinRelationship) =>
    `${r.sourceDE}:${r.sourceColumn}:${r.targetDE}:${r.targetColumn}`;

  const unsavedKeyString = useMemo(
    () => unsaved.map(makeKey).join("|"),
    [unsaved],
  );

  useEffect(() => {
    const keys = new Set(unsavedKeyString.split("|").filter(Boolean));
    setVisibleKeys(keys);
    setExitingKeys(new Set());
  }, [unsavedKeyString, queryRelationships]);

  const animateOut = useCallback((key: string) => {
    setExitingKeys((prev) => new Set(prev).add(key));
    setTimeout(() => {
      setVisibleKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setExitingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, EXIT_ANIMATION_MS);
  }, []);

  const handleSave = useCallback(
    (rel: JoinRelationship) => {
      if (!configDEConfirmed) {
        openFirstSaveDialog({
          sourceDE: rel.sourceDE,
          sourceColumn: rel.sourceColumn,
          targetDE: rel.targetDE,
          targetColumn: rel.targetColumn,
        });
        return;
      }
      onSave(rel);
      animateOut(makeKey(rel));
    },
    [configDEConfirmed, openFirstSaveDialog, onSave, animateOut],
  );

  const handleDismiss = useCallback(
    (rel: JoinRelationship) => {
      dismissForSession(
        rel.sourceDE,
        rel.sourceColumn,
        rel.targetDE,
        rel.targetColumn,
      );
      animateOut(makeKey(rel));
    },
    [dismissForSession, animateOut],
  );

  if (visibleKeys.size === 0) {
    return null;
  }

  const visibleRelationships = unsaved.filter((r) =>
    visibleKeys.has(makeKey(r)),
  );
  if (visibleRelationships.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="relationship-lightbulb"
      className="border-b border-border"
    >
      {visibleRelationships.map((rel) => {
        const key = makeKey(rel);
        const isExiting = exitingKeys.has(key);
        return (
          <div
            key={key}
            data-testid="lightbulb-row"
            className="flex items-center gap-2 px-4 py-1.5 bg-surface text-xs transition-all duration-300 ease-out"
            style={{
              opacity: isExiting ? 0 : 1,
              maxHeight: isExiting ? 0 : 48,
              overflow: "hidden",
            }}
          >
            <Lightbulb size={14} className="text-amber-500 shrink-0" />
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {rel.sourceDE}.{rel.sourceColumn}
              </span>
              {" \u2192 "}
              <span className="font-medium text-foreground">
                {rel.targetDE}.{rel.targetColumn}
              </span>
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="default"
                size="sm"
                className="h-6 px-2 text-[10px]"
                data-testid="lightbulb-save"
                onClick={() => handleSave(rel)}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                data-testid="lightbulb-dismiss"
                onClick={() => handleDismiss(rel)}
              >
                <span aria-hidden>&times;</span>
                <span className="sr-only">Dismiss</span>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
