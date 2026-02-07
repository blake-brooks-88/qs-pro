import type { SubscriptionTier } from "@qpp/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { featuresQueryKeys } from "@/hooks/use-tenant-features";
import { updateTier } from "@/services/features";

import { usageQueryKeys } from "./use-run-usage";

export function useUpdateTier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tier: SubscriptionTier) => updateTier(tier),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: featuresQueryKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: usageQueryKeys.all,
      });
    },
  });
}
