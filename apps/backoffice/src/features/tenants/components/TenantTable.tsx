import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";

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

type TierVariant = "secondary" | "default" | "outline";
type StatusVariant = "success" | "warning" | "destructive" | "secondary";

const TIER_VARIANT_MAP: Record<string, TierVariant> = {
  free: "secondary",
  pro: "default",
  enterprise: "outline",
};

const STATUS_VARIANT_MAP: Record<string, StatusVariant> = {
  active: "success",
  trialing: "warning",
  past_due: "destructive",
  canceled: "destructive",
  unpaid: "destructive",
  incomplete: "destructive",
  incomplete_expired: "destructive",
  inactive: "secondary",
  paused: "secondary",
};

const STATUS_LABEL_MAP: Record<string, string> = {
  active: "Active",
  trialing: "Trialing",
  past_due: "Past Due",
  canceled: "Canceled",
  unpaid: "Unpaid",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
  inactive: "Inactive",
  paused: "Paused",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) {
    return "-";
  }
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface TenantTableProps {
  data: TenantListItem[];
  isLoading: boolean;
  pageCount: number;
  totalItems: number;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
}

function TenantTable({
  data,
  isLoading,
  pageCount,
  totalItems,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
}: TenantTableProps) {
  const columns = useMemo<ColumnDef<TenantListItem, unknown>[]>(
    () => [
      {
        accessorKey: "eid",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="EID" />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.eid}
          </span>
        ),
        size: 110,
      },
      {
        accessorKey: "companyName",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Company" />
        ),
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.companyName}
          </span>
        ),
      },
      {
        accessorKey: "tier",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Tier" />
        ),
        cell: ({ row }) => {
          const tier = row.original.tier;
          const variant = TIER_VARIANT_MAP[tier] ?? "secondary";
          return <Badge variant={variant}>{capitalize(tier)}</Badge>;
        },
        size: 100,
      },
      {
        accessorKey: "subscriptionStatus",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => {
          const status = row.original.subscriptionStatus;
          const variant = STATUS_VARIANT_MAP[status] ?? "secondary";
          const label = STATUS_LABEL_MAP[status] ?? capitalize(status);
          return <Badge variant={variant}>{label}</Badge>;
        },
        size: 100,
      },
      {
        accessorKey: "userCount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Users" />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.userCount}
          </span>
        ),
        enableSorting: false,
        size: 70,
      },
      {
        accessorKey: "signupDate",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Signup" />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.signupDate)}
          </span>
        ),
        size: 120,
      },
      {
        accessorKey: "lastActiveDate",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Last Active" />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.lastActiveDate)}
          </span>
        ),
        enableSorting: false,
        size: 120,
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: pageCount ?? -1,
    state: { pagination, sorting },
    onPaginationChange,
    onSortingChange,
  });

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const totalPages = Math.max(1, table.getPageCount());

  return (
    <div className="w-full">
      <div className="rounded-md border border-border/50 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            {headerGroups.map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="bg-muted/30 border-b border-border"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2 text-left font-medium text-muted-foreground"
                    style={{
                      width:
                        header.getSize() !== 150 ? header.getSize() : undefined,
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {isLoading ? (
              <SkeletonRows colCount={columns.length} />
            ) : rows.length > 0 ? (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                >
                  <td colSpan={columns.length} className="p-0">
                    <Link
                      to={`/tenants/${row.original.tenantId}`}
                      className="grid hover:bg-muted/10 transition-colors"
                      style={{
                        gridTemplateColumns: columns
                          .map((col) =>
                            col.size && col.size !== 150
                              ? `${String(col.size)}px`
                              : "1fr",
                          )
                          .join(" "),
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <span key={cell.id} className="px-3 py-2">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </span>
                      ))}
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-12 text-center text-muted-foreground"
                >
                  No tenants found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={pagination.pageIndex + 1}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pagination.pageSize}
        onPageChange={(page) => {
          table.setPageIndex(page - 1);
        }}
        pageControl="input"
      />
    </div>
  );
}

function SkeletonRows({ colCount }: { colCount: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, rowIdx) => (
        <tr
          key={`skeleton-${String(rowIdx)}`}
          className="border-b border-border/30"
        >
          {Array.from({ length: colCount }).map((_, colIdx) => (
            <td
              key={`skeleton-${String(rowIdx)}-${String(colIdx)}`}
              className="px-3 py-2"
            >
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export { TenantTable, type TenantTableProps };
