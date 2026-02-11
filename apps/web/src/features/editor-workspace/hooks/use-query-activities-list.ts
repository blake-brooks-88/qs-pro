import { useQuery } from "@tanstack/react-query";

import {
  getQueryActivityDetail,
  listQueryActivities,
} from "@/services/query-activities";

export const queryActivityKeys = {
  all: ["query-activities"] as const,
  detail: (customerKey: string) => ["query-activities", customerKey] as const,
};

export function useQueryActivitiesList(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryActivityKeys.all,
    queryFn: listQueryActivities,
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  });
}

export function useQueryActivityDetail(customerKey: string | undefined) {
  return useQuery({
    queryKey: queryActivityKeys.detail(customerKey ?? ""),
    queryFn: async () => {
      if (!customerKey) {
        throw new Error("No customer key provided");
      }
      return getQueryActivityDetail(customerKey);
    },
    enabled: !!customerKey,
  });
}
