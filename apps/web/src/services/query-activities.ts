import type {
  BlastRadiusResponse,
  CreateQueryActivityDto,
  DriftCheckResponse,
  LinkQueryResponse,
  PublishQueryResponse,
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
  const response = await api.get<QADetail>(
    `/query-activities/${encodeURIComponent(customerKey)}`,
  );
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

export async function unlinkQuery(
  savedQueryId: string,
  options?: { deleteLocal?: boolean; deleteRemote?: boolean },
): Promise<void> {
  await api.delete(`/query-activities/link/${savedQueryId}`, {
    data: options,
  });
}

export async function publishQuery(
  savedQueryId: string,
  params: { versionId: string },
): Promise<PublishQueryResponse> {
  const response = await api.post<PublishQueryResponse>(
    `/query-activities/publish/${savedQueryId}`,
    params,
  );
  return response.data;
}

export async function checkDrift(
  savedQueryId: string,
): Promise<DriftCheckResponse> {
  const response = await api.get<DriftCheckResponse>(
    `/query-activities/drift/${savedQueryId}`,
  );
  return response.data;
}

export async function getBlastRadius(
  savedQueryId: string,
): Promise<BlastRadiusResponse> {
  const response = await api.get<BlastRadiusResponse>(
    `/query-activities/blast-radius/${savedQueryId}`,
  );
  return response.data;
}
