import type {
  CreateQueryActivityDto,
  LinkQueryResponse,
  QADetail,
  QAListItem,
} from "@qpp/shared-types";

import api from "@/services/api";

export async function createQueryActivity(
  dto: CreateQueryActivityDto,
): Promise<{ objectId: string; customerKey: string }> {
  const response = await api.post<{ objectId: string; customerKey: string }>(
    "/query-activities",
    dto,
  );
  return response.data;
}

export async function listQueryActivities(): Promise<QAListItem[]> {
  const response = await api.get<QAListItem[]>("/query-activities");
  return response.data;
}

export async function getQueryActivityDetail(
  customerKey: string,
): Promise<QADetail> {
  const response = await api.get<QADetail>(`/query-activities/${customerKey}`);
  return response.data;
}

export async function linkQuery(
  savedQueryId: string,
  params: {
    qaCustomerKey: string;
    conflictResolution?: "keep-local" | "keep-remote";
  },
): Promise<LinkQueryResponse> {
  const response = await api.post<LinkQueryResponse>(
    `/query-activities/link/${savedQueryId}`,
    params,
  );
  return response.data;
}

export async function unlinkQuery(savedQueryId: string): Promise<void> {
  await api.delete(`/query-activities/link/${savedQueryId}`);
}
