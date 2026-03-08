import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface TenantListItem {
  tenantId: string;
  eid: string;
  companyName: string;
  tier: string;
  subscriptionStatus: string;
  userCount: number;
  signupDate: string | null;
  lastActiveDate: string | null;
}

export interface PaginatedTenants {
  data: TenantListItem[];
  page: number;
  limit: number;
  total: number;
}

export interface TenantListParams {
  search?: string;
  tier?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export function useTenants(params: TenantListParams) {
  return useQuery<PaginatedTenants>({
    queryKey: ["tenants", params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedTenants>("/tenants", { params });
      return data;
    },
  });
}

export interface EidLookupResult {
  eid: string;
  companyName: string;
  userCount: number;
  tier: string;
  subscriptionStatus: string;
  signupDate: string | null;
}

export function useEidLookup(eid: string) {
  return useQuery<EidLookupResult>({
    queryKey: ["tenants", "lookup", eid],
    queryFn: async () => {
      const { data } = await api.get<EidLookupResult>(`/tenants/lookup/${eid}`);
      return data;
    },
    enabled: false,
  });
}
