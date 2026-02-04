import type { CreateQueryActivityDto } from "@qpp/shared-types";

import api from "@/services/api";

export async function createQueryActivity(
  dto: CreateQueryActivityDto,
): Promise<{ objectId: string }> {
  const response = await api.post<{ objectId: string }>(
    "/query-activities",
    dto,
  );
  return response.data;
}
