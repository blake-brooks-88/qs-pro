import { useMutation } from "@tanstack/react-query";

import { createPortalSession } from "@/services/billing";

export function usePortalSession() {
  return useMutation({
    mutationFn: () => createPortalSession(),
    onSuccess: (data) => {
      window.open(data.url, "_blank");
    },
  });
}
