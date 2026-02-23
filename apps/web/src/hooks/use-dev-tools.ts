import { useMutation, useQueryClient } from "@tanstack/react-query";

import { featuresQueryKeys } from "@/hooks/use-tenant-features";
import {
  cancelSubscription,
  createCheckout,
  resetToFree,
  setTrialDays,
} from "@/services/dev-tools";

import { usageQueryKeys } from "./use-run-usage";

export function useSetTrialDays() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (days: number | null) => setTrialDays(days),
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

export function useCreateCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tier }: { tier: "pro" | "enterprise" }) =>
      createCheckout(tier, window.location.origin),
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

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => cancelSubscription(),
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

export function useResetToFree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => resetToFree(),
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
