import { useQuery } from "@tanstack/react-query";

import { checkDrift } from "@/services/query-activities";

export const driftCheckKeys = {
  check: (savedQueryId: string) => ["driftCheck", savedQueryId] as const,
};

export function useDriftCheck(savedQueryId: string | undefined) {
  return useQuery({
    queryKey: driftCheckKeys.check(savedQueryId ?? ""),
    queryFn: () => {
      if (!savedQueryId) {
        throw new Error("savedQueryId is required");
      }
      return checkDrift(savedQueryId);
    },
    enabled: false,
    staleTime: 0,
  });
}
