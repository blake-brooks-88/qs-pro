import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  deleteSiemConfig,
  getSiemConfig,
  testSiemWebhook,
  upsertSiemConfig,
} from "@/services/siem-api";

const siemQueryKeys = {
  config: ["siem-config"] as const,
};

export function useSiemConfig() {
  return useQuery({
    queryKey: siemQueryKeys.config,
    queryFn: getSiemConfig,
    staleTime: 60_000,
  });
}

export function useUpsertSiemConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: upsertSiemConfig,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: siemQueryKeys.config });
      toast.success("SIEM configuration saved");
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save SIEM configuration";
      toast.error(message);
    },
  });
}

export function useDeleteSiemConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSiemConfig,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: siemQueryKeys.config });
      toast.success("SIEM configuration deleted");
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete SIEM configuration";
      toast.error(message);
    },
  });
}

export function useTestSiemWebhook() {
  return useMutation({
    mutationFn: testSiemWebhook,
  });
}
