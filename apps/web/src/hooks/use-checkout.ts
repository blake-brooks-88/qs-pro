import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";

import { featuresQueryKeys } from "@/hooks/use-tenant-features";
import { markPendingCheckout } from "@/lib/pending-checkout";
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

function isAlreadyPaidSubscriptionError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const detail = error.response?.data?.detail;
  return (
    typeof detail === "string" &&
    detail.includes("An active paid subscription already exists")
  );
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
      markPendingCheckout();
      // noopener causes window.open to return null even when the popup opened
      // successfully. Do not fall back to window.location.assign — navigating
      // the iframe to Stripe fails (X-Frame-Options: DENY) and destroys the
      // polling loop. If the browser blocks the popup it shows its own UI.
      window.open(data.url, "_blank", "noopener,noreferrer");
      void queryClient.invalidateQueries({
        queryKey: featuresQueryKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: usageQueryKeys.all,
      });
    },
    onError: (error) => {
      if (isAlreadyPaidSubscriptionError(error)) {
        void queryClient.invalidateQueries({
          queryKey: featuresQueryKeys.all,
        });
        void queryClient.invalidateQueries({
          queryKey: usageQueryKeys.all,
        });
      }

      toast.error("Unable to start checkout", {
        description: getCheckoutErrorDescription(error),
      });
    },
  });
}
