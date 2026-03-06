import axios from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { featuresQueryKeys } from "@/hooks/use-tenant-features";
import { createCheckout } from "@/services/billing";

import { usageQueryKeys } from "./use-run-usage";

function getCheckoutErrorDescription(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.trim().length > 0) {
      return detail;
    }

    if (error.response?.status === 404) {
      return "The billing checkout route is unavailable. Please try again after the API is redeployed.";
    }
  }

  return "Please try again or contact support.";
}

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
      const popup = window.open(data.url, "_blank", "noopener,noreferrer");
      if (!popup) {
        window.location.assign(data.url);
      }
      void queryClient.invalidateQueries({
        queryKey: featuresQueryKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: usageQueryKeys.all,
      });
    },
    onError: (error) => {
      toast.error("Unable to start checkout", {
        description: getCheckoutErrorDescription(error),
      });
    },
  });
}
