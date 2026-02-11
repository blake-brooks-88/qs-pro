import { useQuery } from "@tanstack/react-query";

import { getBlastRadius } from "@/services/query-activities";

export const blastRadiusKeys = {
  query: (savedQueryId: string) => ["blastRadius", savedQueryId] as const,
};

export function useBlastRadius(savedQueryId: string | undefined) {
  return useQuery({
    queryKey: blastRadiusKeys.query(savedQueryId ?? ""),
    queryFn: () => {
      if (!savedQueryId) {
        throw new Error("savedQueryId is required");
      }
      return getBlastRadius(savedQueryId);
    },
    enabled: !!savedQueryId,
    staleTime: 30_000,
  });
}
