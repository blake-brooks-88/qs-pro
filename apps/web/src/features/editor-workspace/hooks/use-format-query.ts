import { useCallback } from "react";
import { toast } from "sonner";

import { formatSql } from "../utils/format-sql";

export function useFormatQuery(options: {
  activeTabId: string | null;
  activeTabContent: string;
  storeUpdateTabContent: (tabId: string, content: string) => void;
}): { handleFormat: () => void } {
  const { activeTabId, activeTabContent, storeUpdateTabContent } = options;

  const handleFormat = useCallback(() => {
    if (!activeTabId) {
      return;
    }

    const trimmed = activeTabContent.trim();
    if (!trimmed) {
      toast.warning("No SQL to format");
      return;
    }

    try {
      const formatted = formatSql(activeTabContent);
      storeUpdateTabContent(activeTabId, formatted);
    } catch {
      toast.warning("Could not format query");
    }
  }, [activeTabId, activeTabContent, storeUpdateTabContent]);

  return { handleFormat };
}
