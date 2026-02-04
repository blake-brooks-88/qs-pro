import type { CreateQueryActivityDto } from "@qpp/shared-types";
import { useMutation } from "@tanstack/react-query";

import { createQueryActivity } from "@/services/query-activities";

export function useCreateQueryActivity() {
  return useMutation({
    mutationFn: (dto: CreateQueryActivityDto) => createQueryActivity(dto),
  });
}
