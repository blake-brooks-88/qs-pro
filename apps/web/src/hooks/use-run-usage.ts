import type { UsageResponse } from "@qpp/shared-types";
import { useQuery } from "@tanstack/react-query";

import api from "@/services/api";

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
