import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useCallback, useState } from "react";

export function useResultsPaneResize(options: {
  workspaceRef: RefObject<HTMLElement | null>;
  initialHeight?: number;
}): {
  isResultsOpen: boolean;
  resultsHeight: number;
  isResizingResults: boolean;
  openResultsPane: () => void;
  toggleResultsPane: () => void;
  handleResultsResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
} {
  const { workspaceRef, initialHeight = 280 } = options;

  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [resultsHeight, setResultsHeight] = useState(initialHeight);
  const [isResizingResults, setIsResizingResults] = useState(false);

  const openResultsPane = useCallback(() => {
    setIsResultsOpen(true);
  }, []);

  const toggleResultsPane = useCallback(() => {
    setIsResultsOpen((prev) => !prev);
  }, []);

  const handleResultsResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!workspaceRef.current) {
        return;
      }
      event.preventDefault();

      const startY = event.clientY;
      const startHeight = resultsHeight;
      const containerHeight = workspaceRef.current.clientHeight;
      const minHeight = 160;
      const maxHeight = Math.max(
        minHeight,
        Math.min(560, containerHeight - 120),
      );

      setIsResizingResults(true);

      const handleMove = (moveEvent: globalThis.PointerEvent) => {
        const delta = moveEvent.clientY - startY;
        const nextHeight = Math.min(
          maxHeight,
          Math.max(minHeight, startHeight - delta),
        );
        setResultsHeight(nextHeight);
      };

      const handleUp = () => {
        setIsResizingResults(false);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [resultsHeight, workspaceRef],
  );

  return {
    isResultsOpen,
    resultsHeight,
    isResizingResults,
    openResultsPane,
    toggleResultsPane,
    handleResultsResizeStart,
  };
}
