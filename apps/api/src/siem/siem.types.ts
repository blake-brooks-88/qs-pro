export interface SiemWebhookPayload {
  id: string;
  timestamp: string;
  version: '1.0';
  tenantId: string;
  mid: string;
  event: {
    type: string;
    actorType: 'user' | 'system';
    actorId: string | null;
    actorEmail: string | null;
    targetId: string | null;
    ipAddress: string | null;
    metadata: Record<string, unknown> | null;
  };
}

export interface SiemWebhookJobData {
  payload: SiemWebhookPayload;
  webhookUrl: string;
  secretEncrypted: string;
  tenantId: string;
}

export interface SiemWebhookConfigResponse {
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
