import { useCallback, useState } from "react";

export interface UnlinkTarget {
  savedQueryId: string;
  savedQueryName: string;
  linkedQaName: string;
  linkedQaCustomerKey: string;
}

export function useUnlinkFlow(options: {
  savedQueries?: Array<{
    id: string;
    name: string;
    linkedQaCustomerKey: string | null;
    linkedQaName: string | null;
  }>;
  storeFindTabByQueryId: (queryId: string) =>
    | {
        id: string;
        name: string;
        linkedQaCustomerKey?: string | null;
        linkedQaName?: string | null;
      }
    | undefined;
  storeCloseTab: (tabId: string) => void;
  storeUpdateTabLinkState: (
    tabId: string,
    linkState: {
      linkedQaCustomerKey: string | null;
      linkedQaName: string | null;
    },
  ) => void;
  onTabClose?: (tabId: string) => void;
}): {
  unlinkTarget: UnlinkTarget | null;
  openUnlinkModal: (queryId: string) => void;
  closeUnlinkModal: () => void;
  handleUnlinkComplete: (options: {
    deleteLocal: boolean;
    deleteRemote: boolean;
  }) => void;
} {
  const {
    savedQueries,
    storeFindTabByQueryId,
    storeCloseTab,
    storeUpdateTabLinkState,
    onTabClose,
  } = options;

  const [unlinkTarget, setUnlinkTarget] = useState<UnlinkTarget | null>(null);

  const openUnlinkModal = useCallback(
    (queryId: string) => {
      const tab = storeFindTabByQueryId(queryId);
      const query = savedQueries?.find((q) => q.id === queryId);
      const name = tab?.name ?? query?.name ?? "Query";
      const qaName =
        tab?.linkedQaName ?? query?.linkedQaName ?? "Query Activity";
      const qaKey =
        tab?.linkedQaCustomerKey ?? query?.linkedQaCustomerKey ?? "";

      if (!qaKey) {
        return;
      }

      setUnlinkTarget({
        savedQueryId: queryId,
        savedQueryName: name,
        linkedQaName: qaName,
        linkedQaCustomerKey: qaKey,
      });
    },
    [savedQueries, storeFindTabByQueryId],
  );

  const closeUnlinkModal = useCallback(() => {
    setUnlinkTarget(null);
  }, []);

  const handleUnlinkComplete = useCallback(
    (options: { deleteLocal: boolean; deleteRemote: boolean }) => {
      if (!unlinkTarget) {
        return;
      }

      const tab = storeFindTabByQueryId(unlinkTarget.savedQueryId);
      if (tab) {
        if (options.deleteLocal) {
          storeCloseTab(tab.id);
          onTabClose?.(tab.id);
        } else {
          storeUpdateTabLinkState(tab.id, {
            linkedQaCustomerKey: null,
            linkedQaName: null,
          });
        }
      }

      setUnlinkTarget(null);
    },
    [
      onTabClose,
      storeCloseTab,
      storeFindTabByQueryId,
      storeUpdateTabLinkState,
      unlinkTarget,
    ],
  );

  return {
    unlinkTarget,
    openUnlinkModal,
    closeUnlinkModal,
    handleUnlinkComplete,
  };
}
