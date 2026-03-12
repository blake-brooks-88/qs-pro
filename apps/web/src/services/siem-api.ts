import api from "@/services/api";

export interface SiemConfigResponse {
  id: string;
  webhookUrl: string;
  enabled: boolean;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SiemTestResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

export async function getSiemConfig(): Promise<SiemConfigResponse | null> {
  try {
    const { data } = await api.get<SiemConfigResponse>("/admin/siem/config");
    return data;
  } catch (error: unknown) {
    if (
      error !== null &&
      typeof error === "object" &&
      "response" in error &&
      (error as { response?: { status?: number } }).response?.status === 404
    ) {
      return null;
    }
    throw error;
  }
}

export async function upsertSiemConfig(body: {
  webhookUrl: string;
  secret: string;
}): Promise<SiemConfigResponse> {
  const { data } = await api.put<SiemConfigResponse>(
    "/admin/siem/config",
    body,
  );
  return data;
}

export async function deleteSiemConfig(): Promise<void> {
  await api.delete("/admin/siem/config");
}

export async function testSiemWebhook(): Promise<SiemTestResult> {
  const { data } = await api.post<SiemTestResult>("/admin/siem/test");
  return data;
}
