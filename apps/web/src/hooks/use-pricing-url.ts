import { useQuery } from "@tanstack/react-query";

import { buildPricingUrl, PRICING_PAGE_URL } from "@/config/urls";
import api from "@/services/api";

export function usePricingUrl(): string {
  const { data: token } = useQuery({
    queryKey: ["pricing-token"],
    queryFn: async () => {
      const response = await api.get<{ token: string }>(
        "/billing/pricing-token",
      );
      return response.data.token;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return token ? buildPricingUrl(token) : PRICING_PAGE_URL;
}
