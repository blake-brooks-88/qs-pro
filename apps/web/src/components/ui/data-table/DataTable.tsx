import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";

import { cn } from "@/lib/utils";

import { DataTablePagination } from "./data-table-pagination";

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pageCount?: number;
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  isLoading?: boolean;
  emptyMessage?: string;
  totalItems?: number;
  className?: string;
}

function DataTable<TData>({
  columns,
  data,
  pageCount,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  isLoading = false,
  emptyMessage = "No results found.",
  totalItems,
  className,
}: DataTableProps<TData>) {
  const isServerSide = pagination !== undefined;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(isServerSide && {
      manualPagination: true,
      manualSorting: true,
      pageCount: pageCount ?? -1,
    }),
    state: {
      ...(pagination && { pagination }),
      ...(sorting && { sorting }),
    },
    onPaginationChange,
    onSortingChange,
  });

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const colCount = columns.length;

  return (
    <div className={cn("w-full", className)}>
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
              <SkeletonRows colCount={colCount} />
            ) : rows.length > 0 ? (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-3 py-12 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isServerSide ? (
        <DataTablePagination table={table} totalItems={totalItems ?? 0} />
      ) : null}
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

export { DataTable, type DataTableProps };
