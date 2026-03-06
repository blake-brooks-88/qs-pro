import { useMutation, useQueryClient } from "@tanstack/react-query";

import { featuresQueryKeys } from "@/hooks/use-tenant-features";
import { createCheckout } from "@/services/billing";

import { usageQueryKeys } from "./use-run-usage";

export function useCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tier,
      interval,
    }: {
      tier: "pro";
      interval: "monthly" | "annual";
    }) => createCheckout(tier, interval),
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      void queryClient.invalidateQueries({
        queryKey: featuresQueryKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: usageQueryKeys.all,
      });
    },
  });
}
