import type {
  HistoryListResponse,
  RunSqlTextResponse,
} from "@qpp/shared-types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import axios from "axios";

export interface HistoryFilters {
  page: number;
  pageSize: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  queryId?: string;
  search?: string;
  sortBy: "createdAt" | "durationMs" | "rowCount" | "status";
  sortDir: "asc" | "desc";
}

export const executionHistoryKeys = {
  all: ["executionHistory"] as const,
  list: (filters: HistoryFilters) =>
    ["executionHistory", "list", filters] as const,
  sqlText: (runId: string) => ["executionHistory", "sqlText", runId] as const,
};

async function fetchHistory(
  filters: HistoryFilters,
): Promise<HistoryListResponse> {
  const params = new URLSearchParams();
  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));
  params.set("sortBy", filters.sortBy);
  params.set("sortDir", filters.sortDir);
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }
  if (filters.queryId) {
    params.set("queryId", filters.queryId);
  }
  if (filters.search) {
    params.set("search", filters.search);
  }

  const { data } = await axios.get<HistoryListResponse>(
    `/api/runs/history?${params.toString()}`,
  );
  return data;
}

export function useExecutionHistory(filters: HistoryFilters, enabled = true) {
  return useQuery({
    queryKey: executionHistoryKeys.list(filters),
    queryFn: () => fetchHistory(filters),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

async function fetchRunSqlText(runId: string): Promise<string> {
  const { data } = await axios.get<RunSqlTextResponse>(
    `/api/runs/${runId}/sql`,
  );
  return data.sql;
}

export function useRunSqlText(runId: string) {
  return useQuery({
    queryKey: executionHistoryKeys.sqlText(runId),
    queryFn: () => fetchRunSqlText(runId),
    enabled: false,
    staleTime: 5 * 60_000,
  });
}
