import { useQuery } from "@tanstack/react-query";

import {
  type DataExtensionDetailsResult,
  fetchDataExtensionDetails,
} from "@/services/metadata";

interface UseDataExtensionDetailsParams {
  customerKey: string | null;
  eid?: string;
}

export function useDataExtensionDetails({
  customerKey,
  eid,
}: UseDataExtensionDetailsParams) {
  return useQuery<DataExtensionDetailsResult>({
    queryKey: ["de-details", customerKey, eid ?? "local"],
    queryFn: () => {
      if (!customerKey) {
        throw new Error("customerKey required");
      }
      return fetchDataExtensionDetails({ customerKey, eid });
    },
    enabled: !!customerKey,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}
