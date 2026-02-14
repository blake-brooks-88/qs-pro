import { useCallback } from "react";

import type { TargetUpdateType } from "@/features/editor-workspace/types";

export function useRunRequestHandler(options: {
  isRunning: boolean;
  hasBlockingDiagnostics: boolean;
  isAtRunLimit: boolean;
  activeTab: {
    content: string;
    name: string;
    queryId?: string;
  };
  execute: (
    sqlText: string,
    snippetName?: string,
    targetDeCustomerKey?: string,
    targetUpdateType?: TargetUpdateType,
    savedQueryId?: string,
  ) => Promise<void>;
  onOpenRunBlockedDialog: () => void;
  onOpenUpgradeModal: () => void;
}): () => void {
  const {
    isRunning,
    hasBlockingDiagnostics,
    isAtRunLimit,
    activeTab,
    execute,
    onOpenRunBlockedDialog,
    onOpenUpgradeModal,
  } = options;

  return useCallback(() => {
    if (isRunning) {
      return;
    }
    if (hasBlockingDiagnostics) {
      onOpenRunBlockedDialog();
      return;
    }
    if (isAtRunLimit) {
      onOpenUpgradeModal();
      return;
    }
    void execute(
      activeTab.content,
      activeTab.name,
      undefined,
      undefined,
      activeTab.queryId ?? undefined,
    );
  }, [
    activeTab.content,
    activeTab.name,
    activeTab.queryId,
    execute,
    hasBlockingDiagnostics,
    isAtRunLimit,
    isRunning,
    onOpenRunBlockedDialog,
    onOpenUpgradeModal,
  ]);
}
