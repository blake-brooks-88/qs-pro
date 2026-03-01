import { useQuery } from "@tanstack/react-query";

import type { PricesResponse } from "@/services/billing";
import { fetchPrices } from "@/services/billing";

export const pricesQueryKeys = {
  all: ["billing", "prices"] as const,
};

export function usePrices() {
  return useQuery<PricesResponse, Error>({
    queryKey: pricesQueryKeys.all,
    queryFn: fetchPrices,
    staleTime: 15 * 60 * 1000,
    retry: false,
  });
}
