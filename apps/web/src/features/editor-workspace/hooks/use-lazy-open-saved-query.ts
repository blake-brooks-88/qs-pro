import type { SavedQueryResponse } from "@qpp/shared-types";
import { useCallback, useEffect, useState } from "react";

import { useSavedQuery } from "@/features/editor-workspace/hooks/use-saved-queries";

export function useLazyOpenSavedQuery(options: {
  onOpenSavedQuery: (query: SavedQueryResponse) => void;
}): {
  pendingQueryId: string | null;
  requestOpenSavedQuery: (id: string) => void;
  clearPendingSavedQuery: () => void;
} {
  const { onOpenSavedQuery } = options;

  const [pendingQueryId, setPendingQueryId] = useState<string | null>(null);
  const { data: pendingQuery } = useSavedQuery(pendingQueryId ?? undefined);

  useEffect(() => {
    if (!pendingQueryId || !pendingQuery) {
      return;
    }
    if (pendingQuery.id !== pendingQueryId) {
      return;
    }

    onOpenSavedQuery(pendingQuery);
    setPendingQueryId(null);
  }, [pendingQuery, pendingQueryId, onOpenSavedQuery]);

  const requestOpenSavedQuery = useCallback((id: string) => {
    setPendingQueryId(id);
  }, []);

  const clearPendingSavedQuery = useCallback(() => {
    setPendingQueryId(null);
  }, []);

  return { pendingQueryId, requestOpenSavedQuery, clearPendingSavedQuery };
}
