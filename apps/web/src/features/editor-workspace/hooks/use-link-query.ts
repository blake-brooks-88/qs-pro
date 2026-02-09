import { useMutation, useQueryClient } from "@tanstack/react-query";

import { linkQuery, unlinkQuery } from "@/services/query-activities";

import { queryActivityKeys } from "./use-query-activities-list";

const SAVED_QUERIES_KEY = ["saved-queries"] as const;

export function useLinkQuery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      savedQueryId,
      qaCustomerKey,
      conflictResolution,
    }: {
      savedQueryId: string;
      qaCustomerKey: string;
      conflictResolution?: "keep-local" | "keep-remote";
    }) => linkQuery(savedQueryId, { qaCustomerKey, conflictResolution }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SAVED_QUERIES_KEY });
      void queryClient.invalidateQueries({
        queryKey: queryActivityKeys.all,
      });
    },
  });
}

export function useUnlinkQuery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (savedQueryId: string) => unlinkQuery(savedQueryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SAVED_QUERIES_KEY });
      void queryClient.invalidateQueries({
        queryKey: queryActivityKeys.all,
      });
    },
  });
}
