import { useQuery } from "@tanstack/react-query";

import api from "@/services/api";

// TODO: Import from @qpp/shared-types once Plan 01 merges the backend usage endpoint
interface UsageResponse {
  queryRuns: {
    current: number;
    limit: number | null;
    resetDate: string;
  };
  savedQueries: {
    current: number;
    limit: number | null;
  };
}

export const usageQueryKeys = {
  all: ["usage"] as const,
  current: () => [...usageQueryKeys.all, "current"] as const,
};

export function useRunUsage() {
  return useQuery({
    queryKey: usageQueryKeys.current(),
    queryFn: async () => {
      const { data } = await api.get<UsageResponse>("/usage");
      return data;
    },
    staleTime: 30_000,
    retry: false,
  });
}
