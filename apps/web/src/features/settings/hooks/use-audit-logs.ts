import { useQuery } from "@tanstack/react-query";

import api from "@/services/api";

export interface AuditLogFilters {
  eventType?: string;
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page: number;
  pageSize: number;
  sortBy?: "createdAt" | "eventType";
  sortDir?: "asc" | "desc";
}

export interface AuditLogItem {
  id: string;
  tenantId: string;
  mid: string;
  eventType: string;
  actorType: "user" | "system";
  actorId: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditLogListResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function useAuditLogs(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(filters.page));
      params.set("pageSize", String(filters.pageSize));

      if (filters.eventType) {
        params.set("eventType", filters.eventType);
      }
      if (filters.actorId) {
        params.set("actorId", filters.actorId);
      }
      if (filters.dateFrom) {
        params.set("dateFrom", filters.dateFrom);
      }
      if (filters.dateTo) {
        params.set("dateTo", filters.dateTo);
      }
      if (filters.search) {
        params.set("search", filters.search);
      }
      if (filters.sortBy) {
        params.set("sortBy", filters.sortBy);
      }
      if (filters.sortDir) {
        params.set("sortDir", filters.sortDir);
      }

      const { data } = await api.get<AuditLogListResponse>(
        `/audit-logs?${params.toString()}`,
      );
      return data;
    },
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  });
}
