import { useMutation, useQueryClient } from "@tanstack/react-query";

import { publishQuery } from "@/services/query-activities";

import { queryActivityKeys } from "./use-query-activities-list";
import { versionHistoryKeys } from "./use-query-versions";

const SAVED_QUERIES_KEY = ["saved-queries"] as const;

export function usePublishQuery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      savedQueryId,
      versionId,
    }: {
      savedQueryId: string;
      versionId: string;
    }) => publishQuery(savedQueryId, { versionId }),
    onSuccess: (_data, { savedQueryId }) => {
      void queryClient.invalidateQueries({ queryKey: SAVED_QUERIES_KEY });
      void queryClient.invalidateQueries({
        queryKey: queryActivityKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: versionHistoryKeys.list(savedQueryId),
      });
    },
  });
}
