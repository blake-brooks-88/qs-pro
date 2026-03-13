import { Download } from "@solar-icons/react";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { useAuditLogExport } from "../hooks/use-audit-export";
import type { AuditLogFilters, AuditLogItem } from "../hooks/use-audit-logs";
import { useAuditLogs } from "../hooks/use-audit-logs";
import { SiemWebhookConfig } from "./SiemWebhookConfig";

type DatePreset = "24h" | "7d" | "30d" | "all";

const EVENT_TYPE_CATEGORIES = [
  { value: "", label: "All Events" },
  { value: "auth", label: "Auth" },
  { value: "saved_query", label: "Saved Queries" },
  { value: "folder", label: "Folders" },
  { value: "query_activity", label: "Query Activities" },
  { value: "version", label: "Versions" },
  { value: "subscription", label: "Subscription" },
  { value: "role", label: "Roles" },
  { value: "siem", label: "SIEM" },
  { value: "system", label: "System" },
] as const;

function getDateRange(preset: DatePreset): { from?: string; to?: string } {
  if (preset === "all") {
    return {};
  }

  const now = new Date();
  const to = now.toISOString();

  const hoursMap: Record<Exclude<DatePreset, "all">, number> = {
    "24h": 24,
    "7d": 168,
    "30d": 720,
  };

  // eslint-disable-next-line security/detect-object-injection
  const from = new Date(now.getTime() - hoursMap[preset] * 3_600_000);
  return { from: from.toISOString(), to };
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatEventType(eventType: string): string {
  return eventType
    .split(".")
    .map((part) =>
      part
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
    )
    .join(" > ");
}

const columns: ColumnDef<AuditLogItem, unknown>[] = [
  {
    accessorKey: "createdAt",
    header: "Timestamp",
    size: 170,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatTimestamp(row.original.createdAt)}
      </span>
    ),
  },
  {
    accessorKey: "actorId",
    header: "Actor",
    cell: ({ row }) => {
      if (row.original.actorType === "system") {
        return <span className="text-sm text-foreground">System</span>;
      }
      const name = row.original.actorName;
      const email = row.original.actorEmail;
      if (name) {
        return (
          <div className="flex flex-col">
            <span className="text-sm text-foreground">{name}</span>
            {email ? (
              <span className="text-xs text-muted-foreground">{email}</span>
            ) : null}
          </div>
        );
      }
      const id = row.original.actorId ?? "Unknown";
      return (
        <span className="text-sm text-muted-foreground">
          {id.slice(0, 8)}...
        </span>
      );
    },
  },
  {
    accessorKey: "eventType",
    header: "Action",
    cell: ({ row }) => (
      <span className="text-sm font-medium text-foreground">
        {formatEventType(row.original.eventType)}
      </span>
    ),
  },
  {
    accessorKey: "targetId",
    header: "Resource",
    cell: ({ row }) => {
      const targetId = row.original.targetId;
      const targetName = row.original.targetName;
      const targetEmail = row.original.targetEmail;
      if (targetName) {
        return (
          <div className="flex flex-col">
            <span className="text-sm text-foreground">{targetName}</span>
            {targetEmail ? (
              <span className="text-xs text-muted-foreground">
                {targetEmail}
              </span>
            ) : null}
          </div>
        );
      }
      if (!targetId) {
        return (
          <span className="text-sm text-muted-foreground">{"\u2014"}</span>
        );
      }
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(targetId);
      return (
        <span className="text-sm text-muted-foreground" title={targetId}>
          {isUuid ? `${targetId.slice(0, 8)}...` : targetId}
        </span>
      );
    },
  },
  {
    accessorKey: "ipAddress",
    header: "IP Address",
    size: 130,
    cell: ({ row }) => (
      <span className="text-xs font-mono text-muted-foreground">
        {row.original.ipAddress ?? "\u2014"}
      </span>
    ),
  },
];

export function AuditLogTab() {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");

  const dateRange = useMemo(() => getDateRange(datePreset), [datePreset]);

  const filters: AuditLogFilters = useMemo(
    () => ({
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
      eventType: eventTypeFilter ? `${eventTypeFilter}.*` : undefined,
      search: searchFilter || undefined,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      sortBy:
        sorting[0]?.id === "createdAt" || sorting[0]?.id === "eventType"
          ? sorting[0].id
          : "createdAt",
      sortDir: sorting[0]?.desc ? "desc" : "asc",
    }),
    [pagination, sorting, eventTypeFilter, searchFilter, dateRange],
  );

  const { data, isLoading } = useAuditLogs(filters);

  const exportFilters = useMemo(() => {
    const { page: _p, pageSize: _ps, ...rest } = filters;
    return rest;
  }, [filters]);

  const { exportCsv, isExporting } = useAuditLogExport(exportFilters);

  const pageCount = data ? Math.ceil(data.total / pagination.pageSize) : -1;

  const handleDatePreset = useCallback((preset: DatePreset) => {
    setDatePreset(preset);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const handleEventTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setEventTypeFilter(e.target.value);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    [],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchFilter(e.target.value);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    [],
  );

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Select
          className="w-40"
          value={eventTypeFilter}
          onChange={handleEventTypeChange}
        >
          {EVENT_TYPE_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </Select>

        <Input
          placeholder="Search..."
          className="w-48"
          value={searchFilter}
          onChange={handleSearchChange}
        />

        <div className="flex gap-1">
          {(["24h", "7d", "30d", "all"] as const).map((preset) => (
            <Button
              key={preset}
              variant={datePreset === preset ? "default" : "outline"}
              size="sm"
              onClick={() => handleDatePreset(preset)}
            >
              {preset === "all" ? "All Time" : preset}
            </Button>
          ))}
        </div>

        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportCsv()}
            disabled={isExporting}
          >
            <Download size={14} className="mr-1.5" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        pageCount={pageCount}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
        isLoading={isLoading}
        emptyMessage="No audit events found"
        totalItems={data?.total}
      />

      <div className="border-t border-border mt-8 pt-8">
        <SiemWebhookConfig />
      </div>
    </div>
  );
}
