import {
  AltArrowLeft,
  AltArrowRight,
  DoubleAltArrowLeft,
  DoubleAltArrowRight,
} from "@solar-icons/react";
import { type Table } from "@tanstack/react-table";

import { cn } from "@/lib/utils";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  totalItems: number;
  className?: string;
}

function DataTablePagination<TData>({
  table,
  totalItems,
  className,
}: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const start = pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, totalItems);

  return (
    <div
      className={cn(
        "flex items-center justify-between px-2 py-3 text-xs text-muted-foreground",
        className,
      )}
    >
      <span>
        {totalItems > 0
          ? `Showing ${String(start)}-${String(end)} of ${String(totalItems)} results`
          : "No results"}
      </span>

      <div className="flex items-center gap-1">
        <PaginationButton
          onClick={() => {
            table.setPageIndex(0);
          }}
          disabled={!table.getCanPreviousPage()}
          aria-label="Go to first page"
        >
          <DoubleAltArrowLeft weight="Bold" className="h-3.5 w-3.5" />
        </PaginationButton>

        <PaginationButton
          onClick={() => {
            table.previousPage();
          }}
          disabled={!table.getCanPreviousPage()}
          aria-label="Go to previous page"
        >
          <AltArrowLeft weight="Bold" className="h-3.5 w-3.5" />
        </PaginationButton>

        <span className="px-2 text-foreground tabular-nums">
          Page {String(pageIndex + 1)} of {String(pageCount)}
        </span>

        <PaginationButton
          onClick={() => {
            table.nextPage();
          }}
          disabled={!table.getCanNextPage()}
          aria-label="Go to next page"
        >
          <AltArrowRight weight="Bold" className="h-3.5 w-3.5" />
        </PaginationButton>

        <PaginationButton
          onClick={() => {
            table.setPageIndex(pageCount - 1);
          }}
          disabled={!table.getCanNextPage()}
          aria-label="Go to last page"
        >
          <DoubleAltArrowRight weight="Bold" className="h-3.5 w-3.5" />
        </PaginationButton>
      </div>
    </div>
  );
}

function PaginationButton({
  children,
  disabled,
  onClick,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-7 w-7 items-center justify-center rounded border border-border/50 bg-background hover:bg-muted/50 transition-colors disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

export { DataTablePagination, type DataTablePaginationProps };
