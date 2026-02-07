import { AltArrowDown, AltArrowUp, SortVertical } from "@solar-icons/react";
import { type Column } from "@tanstack/react-table";

import { cn } from "@/lib/utils";

interface DataTableColumnHeaderProps<TData> {
  column: Column<TData, unknown>;
  title: string;
  className?: string;
}

function DataTableColumnHeader<TData>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData>) {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>;
  }

  const sorted = column.getIsSorted();

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 -ml-1 px-1 py-0.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground",
        sorted && "text-foreground",
        className,
      )}
      onClick={() => {
        column.toggleSorting(sorted === "asc");
      }}
    >
      <span>{title}</span>
      {sorted === "asc" ? (
        <AltArrowUp weight="Bold" className="h-3 w-3" />
      ) : sorted === "desc" ? (
        <AltArrowDown weight="Bold" className="h-3 w-3" />
      ) : (
        <SortVertical weight="Linear" className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}

export { DataTableColumnHeader, type DataTableColumnHeaderProps };
