import { useCallback, useState } from "react";
import { toast } from "sonner";

import api from "@/services/api";

import type { AuditLogFilters, AuditLogItem } from "./use-audit-logs";

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportAuditLogCsv(
  items: AuditLogItem[],
  filename: string,
): void {
  const headers = ["Timestamp", "Actor", "Action", "Resource", "IP Address"];
  const rows = items.map((item) => [
    escapeCsvCell(item.createdAt),
    escapeCsvCell(item.actorId ?? "System"),
    escapeCsvCell(item.eventType),
    escapeCsvCell(item.targetId ?? ""),
    escapeCsvCell(item.ipAddress ?? ""),
  ]);

  const csvContent = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface AuditLogExportResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function useAuditLogExport(
  filters: Omit<AuditLogFilters, "page" | "pageSize">,
) {
  const [isExporting, setIsExporting] = useState(false);

  const exportCsv = useCallback(async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "10000");

      if (filters.eventType) {
        params.set("eventType", filters.eventType);
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

      const { data } = await api.get<AuditLogExportResponse>(
        `/audit-logs?${params.toString()}`,
      );

      const today = new Date().toISOString().split("T")[0];
      exportAuditLogCsv(data.items, `audit-log-export-${today}.csv`);
      toast.success(`Exported ${String(data.items.length)} audit events`);
    } catch {
      toast.error("Failed to export audit logs");
    } finally {
      setIsExporting(false);
    }
  }, [filters]);

  return { exportCsv, isExporting };
}
