import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { createPortalSession } from "@/services/billing";

export function usePortalSession() {
  return useMutation({
    mutationFn: () => createPortalSession(),
    onSuccess: (data) => {
      window.open(data.url, "_blank");
    },
    onError: () => {
      toast.error("Unable to open billing portal", {
        description: "Please try again or contact support.",
      });
    },
  });
}
