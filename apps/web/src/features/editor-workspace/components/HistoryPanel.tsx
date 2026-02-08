import type {
  ExecutionHistoryItem,
  RunSqlTextResponse,
} from "@qpp/shared-types";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Copy, DocumentAdd, MenuDots } from "@solar-icons/react";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import axios from "axios";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  DataTable,
  DataTableColumnHeader,
  DataTableToolbar,
} from "@/components/ui/data-table";
import { LockedOverlay } from "@/components/ui/locked-overlay";
import { runStatusToVariant, StatusBadge } from "@/components/ui/status-badge";
import { useFeature } from "@/hooks/use-feature";
import { cn } from "@/lib/utils";

import {
  type HistoryFilters,
  useExecutionHistory,
} from "../hooks/use-execution-history";
import { useActivityBarStore } from "../store/activity-bar-store";
import { SqlPreviewHoverCard } from "./SqlPreviewHoverCard";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number | null): string {
  if (ms === null) {
    return "--";
  }
  if (ms < 1000) {
    return "< 1s";
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${String(minutes)}m ${String(seconds)}s`;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) {
    return "just now";
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${String(minutes)}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${String(hours)}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${String(days)}d ago`;
  }
  const months = Math.floor(days / 30);
  return `${String(months)}mo ago`;
}

function formatRowCount(n: number | null): string {
  if (n === null) {
    return "--";
  }
  return new Intl.NumberFormat("en-US").format(n);
}

const STATUS_LABEL = new Map<string, string>([
  ["ready", "Success"],
  ["failed", "Failed"],
  ["canceled", "Canceled"],
  ["running", "Running"],
  ["queued", "Queued"],
]);

// ---------------------------------------------------------------------------
// Date preset helpers
// ---------------------------------------------------------------------------

type DatePreset = "today" | "7d" | "30d" | "month";

function getDatePresetRange(preset: DatePreset): {
  dateFrom: string;
  dateTo: string;
} {
  const now = new Date();
  const dateTo = now.toISOString();

  switch (preset) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { dateFrom: start.toISOString(), dateTo };
    }
    case "7d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { dateFrom: start.toISOString(), dateTo };
    }
    case "30d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return { dateFrom: start.toISOString(), dateTo };
    }
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { dateFrom: start.toISOString(), dateTo };
    }
  }
}

// ---------------------------------------------------------------------------
// HistoryPanel
// ---------------------------------------------------------------------------

interface HistoryPanelProps {
  queryIdFilter?: string;
  onRerun?: (sql: string, queryName: string, createdAt: string) => void;
  onCopySql?: (sql: string) => void;
  onUpgradeClick?: () => void;
}

const STATUSES = ["ready", "failed", "canceled", "running", "queued"] as const;
const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
];

export function HistoryPanel({
  queryIdFilter,
  onRerun,
  onCopySql,
  onUpgradeClick,
}: HistoryPanelProps) {
  const { enabled: hasAccess } = useFeature("executionHistory");
  const clearHistoryFilter = useActivityBarStore((s) => s.clearHistoryFilter);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [datePreset, setDatePreset] = useState<DatePreset | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  // Build filter object for the API
  const filters = useMemo((): HistoryFilters => {
    const sortCol = sorting[0];
    const dateRange = datePreset ? getDatePresetRange(datePreset) : undefined;

    return {
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
      status: statusFilter.length > 0 ? statusFilter.join(",") : undefined,
      dateFrom: dateRange?.dateFrom,
      dateTo: dateRange?.dateTo,
      queryId: queryIdFilter,
      search: searchValue || undefined,
      sortBy: (sortCol?.id as HistoryFilters["sortBy"]) ?? "createdAt",
      sortDir: sortCol?.desc ? "desc" : "asc",
    };
  }, [
    pagination,
    statusFilter,
    datePreset,
    searchValue,
    sorting,
    queryIdFilter,
  ]);

  const { data, isLoading } = useExecutionHistory(filters);

  const items = data?.items ?? [];
  const totalItems = data?.total ?? 0;
  const pageCount = Math.ceil(totalItems / pagination.pageSize);

  // Reset to first page when filters change
  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const handleStatusFilterChange = useCallback(
    (status: string, checked: boolean | "indeterminate") => {
      setStatusFilter((prev) =>
        checked === true
          ? prev.includes(status)
            ? prev
            : [...prev, status]
          : prev.filter((value) => value !== status),
      );
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    [],
  );

  const clearStatusFilters = useCallback(() => {
    setStatusFilter([]);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const handleDatePreset = useCallback((preset: DatePreset) => {
    setDatePreset((prev) => (prev === preset ? null : preset));
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setStatusFilter([]);
    setDatePreset(null);
    setSearchValue("");
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  // Column definitions
  const columns = useMemo(
    (): ColumnDef<ExecutionHistoryItem, unknown>[] => [
      {
        accessorKey: "status",
        header: ({ column }) => {
          const hasStatusFilter = statusFilter.length > 0;

          return (
            <div className="flex items-center gap-1">
              <DataTableColumnHeader column={column} title="Status" />
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    aria-label="Filter status"
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-muted/50 text-muted-foreground hover:text-foreground",
                      hasStatusFilter && "bg-muted/50 text-foreground",
                    )}
                  >
                    <MenuDots size={12} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="min-w-[180px] bg-card border border-border rounded-lg shadow-xl p-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                    sideOffset={5}
                    align="start"
                  >
                    <DropdownMenu.Label className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Filter Status
                    </DropdownMenu.Label>
                    <DropdownMenu.Separator className="h-px bg-border my-1" />
                    {STATUSES.map((status) => (
                      <DropdownMenu.CheckboxItem
                        key={status}
                        checked={statusFilter.includes(status)}
                        onCheckedChange={(checked) => {
                          handleStatusFilterChange(status, checked);
                        }}
                        className="relative pl-7 pr-3 py-2 text-xs rounded-md cursor-pointer outline-none transition-colors hover:bg-muted/50 focus:bg-muted/50"
                      >
                        <DropdownMenu.ItemIndicator className="absolute left-2 inline-flex items-center justify-center text-primary">
                          ✓
                        </DropdownMenu.ItemIndicator>
                        {STATUS_LABEL.get(status) ?? status}
                      </DropdownMenu.CheckboxItem>
                    ))}
                    {hasStatusFilter ? (
                      <>
                        <DropdownMenu.Separator className="h-px bg-border my-1" />
                        <DropdownMenu.Item
                          className="px-2 py-1.5 text-xs rounded-md cursor-pointer outline-none transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50 focus:bg-muted/50"
                          onSelect={clearStatusFilters}
                        >
                          Clear status filter
                        </DropdownMenu.Item>
                      </>
                    ) : null}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          );
        },
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <StatusBadge variant={runStatusToVariant(status)}>
              {STATUS_LABEL.get(status) ?? status}
            </StatusBadge>
          );
        },
        size: 110,
        enableSorting: true,
      },
      {
        accessorKey: "queryName",
        header: "Name",
        cell: ({ row }) => (
          <span
            className="truncate block max-w-full"
            title={row.original.queryName ?? undefined}
          >
            {row.original.queryName ?? "Untitled"}
          </span>
        ),
        size: 120,
        enableSorting: false,
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Time" />
        ),
        cell: ({ row }) => {
          const date = row.original.createdAt;
          return (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <span className="whitespace-nowrap text-muted-foreground cursor-default">
                  {formatRelativeTime(date)}
                </span>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50"
                  sideOffset={5}
                >
                  {new Date(date).toLocaleString()}
                  <Tooltip.Arrow className="fill-foreground" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        },
        size: 80,
        enableSorting: true,
      },
      {
        accessorKey: "durationMs",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Duration" />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDuration(row.original.durationMs)}
          </span>
        ),
        size: 70,
        enableSorting: true,
      },
      {
        accessorKey: "rowCount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Rows" />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums text-muted-foreground">
            {formatRowCount(row.original.rowCount)}
          </span>
        ),
        size: 70,
        enableSorting: true,
      },
      {
        accessorKey: "sqlPreview",
        header: "SQL",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <SqlPreviewHoverCard
              runId={item.id}
              hasSql={item.hasSql}
              onOpenInNewTab={(sql) =>
                onRerun?.(sql, item.queryName ?? "Untitled", item.createdAt)
              }
            >
              <span className="truncate block max-w-[140px] font-mono text-xs text-muted-foreground">
                {item.hasSql ? (item.sqlPreview ?? "SQL available") : "\u2014"}
              </span>
            </SqlPreviewHoverCard>
          );
        },
        size: 140,
        enableSorting: false,
      },
      {
        accessorKey: "targetDeCustomerKey",
        header: "Target DE",
        cell: ({ row }) => {
          const key = row.original.targetDeCustomerKey;
          if (!key) {
            return null;
          }

          return (
            <span
              className="truncate block max-w-full text-muted-foreground"
              title={key}
            >
              {key}
            </span>
          );
        },
        size: 100,
        enableSorting: false,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const item = row.original;

          return (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Row actions"
                >
                  <MenuDots size={14} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[160px] bg-card border border-border rounded-lg shadow-xl p-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                  sideOffset={5}
                  align="end"
                >
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-3 py-2 text-xs rounded-md cursor-pointer outline-none transition-colors hover:bg-muted/50 focus:bg-muted/50 data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed"
                    disabled={!item.hasSql}
                    onSelect={() => {
                      if (!item.hasSql) {
                        return;
                      }
                      void axios
                        .get<RunSqlTextResponse>(`/api/runs/${item.id}/sql`)
                        .then(({ data }) => {
                          onRerun?.(
                            data.sql,
                            item.queryName ?? "Untitled",
                            item.createdAt,
                          );
                        })
                        .catch(() => {
                          toast.error("Unable to retrieve SQL");
                        });
                    }}
                  >
                    <DocumentAdd size={14} />
                    Open in new tab
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-3 py-2 text-xs rounded-md cursor-pointer outline-none transition-colors hover:bg-muted/50 focus:bg-muted/50 data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed"
                    disabled={!item.hasSql}
                    onSelect={() => {
                      if (!item.hasSql) {
                        return;
                      }
                      void axios
                        .get<RunSqlTextResponse>(`/api/runs/${item.id}/sql`)
                        .then(({ data }) => {
                          onCopySql?.(data.sql);
                        })
                        .catch(() => {
                          toast.error("Unable to retrieve SQL");
                        });
                    }}
                  >
                    <Copy size={14} />
                    Copy SQL
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          );
        },
        size: 40,
        enableSorting: false,
      },
    ],
    [
      onRerun,
      onCopySql,
      statusFilter,
      handleStatusFilterChange,
      clearStatusFilters,
    ],
  );

  // Determine empty state message
  const emptyMessage =
    statusFilter.length > 0 ||
    datePreset !== null ||
    searchValue ||
    queryIdFilter
      ? "No runs match your filters."
      : "No query runs yet. Run a query to see it here.";

  const hasActiveFilters =
    statusFilter.length > 0 || datePreset !== null || searchValue.length > 0;

  const panelContent = (
    <div className="flex flex-col h-full">
      {/* Per-query breadcrumb */}
      {queryIdFilter ? (
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/30 text-xs">
          <span className="text-muted-foreground">
            Showing:{" "}
            <span className="text-foreground font-medium">
              {items[0]?.queryName ?? "Query"}
            </span>
          </span>
          <button
            type="button"
            onClick={clearHistoryFilter}
            className="text-primary hover:underline text-xs"
          >
            View All History
          </button>
        </div>
      ) : null}

      {/* Toolbar: search */}
      <div className="px-2">
        <DataTableToolbar
          searchValue={searchValue}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Search name or target DE..."
          className="py-1.5"
        >
          <div className="flex items-center gap-1.5">
            {DATE_PRESETS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleDatePreset(key)}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-medium rounded border transition-colors",
                  datePreset === key
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50",
                )}
              >
                {label}
              </button>
            ))}

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            ) : null}
          </div>
        </DataTableToolbar>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 px-2 pb-2">
        <DataTable
          columns={columns}
          data={items}
          pageCount={pageCount}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={setSorting}
          isLoading={isLoading}
          emptyMessage={emptyMessage}
          totalItems={totalItems}
        />
      </div>
    </div>
  );

  if (!hasAccess) {
    return (
      <LockedOverlay
        locked
        variant="panel"
        tier="pro"
        title="Unlock Execution History"
        description="Search past runs, filter by status, and re-run queries with one click."
        ctaLabel="Upgrade to Pro"
        onCtaClick={onUpgradeClick}
      >
        {panelContent}
      </LockedOverlay>
    );
  }

  return panelContent;
}
