import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface TenantUserDto {
  name: string | null;
  email: string | null;
  lastActiveDate: string | null;
}

export interface FeatureOverrideDto {
  featureKey: string;
  enabled: boolean;
}

export interface AuditLogEntryDto {
  id: string;
  backofficeUserId: string;
  eventType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TenantDetail {
  tenantId: string;
  eid: string;
  companyName: string;
  tier: string;
  subscriptionStatus: string;
  seatLimit: number | null;
  currentPeriodEnds: string | null;
  trialEndsAt: string | null;
  stripeSubscriptionId: string | null;
  signupDate: string | null;
  users: TenantUserDto[];
  featureOverrides: FeatureOverrideDto[];
  recentAuditLogs: AuditLogEntryDto[];
}

export function useTenantDetail(tenantId: string) {
  return useQuery<TenantDetail>({
    queryKey: ["tenants", tenantId],
    queryFn: async () => {
      const { data } = await api.get<TenantDetail>(`/tenants/${tenantId}`);
      return data;
    },
    enabled: !!tenantId,
  });
}

export function useFeatureOverrides(tenantId: string) {
  return useQuery<FeatureOverrideDto[]>({
    queryKey: ["tenants", tenantId, "feature-overrides"],
    queryFn: async () => {
      const { data } = await api.get<FeatureOverrideDto[]>(
        `/tenants/${tenantId}/feature-overrides`,
      );
      return data;
    },
    enabled: !!tenantId,
  });
}

export function useSetFeatureOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tenantId,
      featureKey,
      enabled,
    }: {
      tenantId: string;
      featureKey: string;
      enabled: boolean;
    }) => {
      await api.put(`/tenants/${tenantId}/feature-overrides/${featureKey}`, {
        enabled,
      });
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["tenants", variables.tenantId],
      });
    },
  });
}

export function useRemoveFeatureOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tenantId,
      featureKey,
    }: {
      tenantId: string;
      featureKey: string;
    }) => {
      await api.delete(`/tenants/${tenantId}/feature-overrides/${featureKey}`);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["tenants", variables.tenantId],
      });
    },
  });
}

export function useChangeTier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tenantId,
      tier,
      interval,
    }: {
      tenantId: string;
      tier: "pro" | "enterprise";
      interval: "monthly" | "annual";
    }) => {
      await api.patch(`/tenants/${tenantId}/tier`, { tier, interval });
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["tenants", variables.tenantId],
      });
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantId }: { tenantId: string }) => {
      await api.post(`/tenants/${tenantId}/cancel`);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["tenants", variables.tenantId],
      });
    },
  });
}
