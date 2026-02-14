import type { PublishEventsListResponse } from "@qpp/shared-types";
import { useQuery } from "@tanstack/react-query";

import { fetchPublishEvents } from "@/services/query-activities";

export const publishEventsKeys = {
  all: ["publishEvents"] as const,
  list: (savedQueryId: string) =>
    ["publishEvents", "list", savedQueryId] as const,
};

export function usePublishEvents(savedQueryId: string | undefined) {
  return useQuery<PublishEventsListResponse>({
    queryKey: publishEventsKeys.list(savedQueryId ?? "disabled"),
    queryFn: () => fetchPublishEvents(savedQueryId as string),
    enabled: !!savedQueryId,
    staleTime: 30_000,
  });
}
