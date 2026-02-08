import {
  AltArrowLeft,
  AltArrowRight,
  DoubleAltArrowLeft,
  DoubleAltArrowRight,
} from "@solar-icons/react";
import { cva } from "class-variance-authority";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

const paginationVariants = cva(
  "h-10 border-t border-border bg-card flex items-center justify-between px-4 shrink-0",
  {
    variants: {
      density: {
        compact: "",
        comfortable: "h-11 px-5",
      },
    },
    defaultVariants: {
      density: "compact",
    },
  },
);

const rangeLabelVariants = cva("text-muted-foreground", {
  variants: {
    rangeVariant: {
      compact: "text-[10px] font-bold uppercase tracking-widest",
      detailed: "text-xs font-medium",
    },
  },
  defaultVariants: {
    rangeVariant: "compact",
  },
});

const navButtonVariants = cva(
  "p-1.5 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors",
);

const pageButtonVariants = cva(
  "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-all",
  {
    variants: {
      active: {
        true: "bg-primary text-primary-foreground shadow-sm shadow-primary/40",
        false: "text-muted-foreground hover:bg-muted",
      },
    },
  },
);

const pageControlVariants = cva("px-2", {
  variants: {
    pageControl: {
      buttons: "flex items-center gap-1",
      text: "text-xs font-medium text-foreground tabular-nums",
      input:
        "flex items-center gap-1.5 text-xs font-medium text-foreground tabular-nums",
    },
  },
  defaultVariants: {
    pageControl: "buttons",
  },
});

const pageInputVariants = cva(
  "h-6 w-12 rounded border border-border bg-background px-1 text-center text-[10px] text-foreground outline-none focus:border-primary",
);

type PaginationDensity = "compact" | "comfortable";
type PaginationRangeVariant = "compact" | "detailed";
type PaginationPageControl = "buttons" | "text" | "input";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange?: (page: number) => void;
  className?: string;
  maxVisiblePages?: number;
  density?: PaginationDensity;
  rangeVariant?: PaginationRangeVariant;
  pageControl?: PaginationPageControl;
}

function clampPage(page: number, totalPages: number): number {
  return Math.min(totalPages, Math.max(1, page));
}

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  className,
  maxVisiblePages = 5,
  density = "compact",
  rangeVariant = "compact",
  pageControl = "buttons",
}: PaginationProps) {
  const normalizedTotalPages =
    Number.isFinite(totalPages) && totalPages > 0 ? Math.floor(totalPages) : 1;
  const normalizedCurrentPage = clampPage(
    Math.floor(currentPage) || 1,
    normalizedTotalPages,
  );

  const startRow =
    totalItems > 0 ? (normalizedCurrentPage - 1) * pageSize + 1 : 0;
  const endRow =
    totalItems > 0 ? Math.min(normalizedCurrentPage * pageSize, totalItems) : 0;

  const [pageInput, setPageInput] = useState(String(normalizedCurrentPage));

  useEffect(() => {
    setPageInput(String(normalizedCurrentPage));
  }, [normalizedCurrentPage]);

  const visiblePages = useMemo(
    () =>
      Array.from(
        { length: Math.min(maxVisiblePages, normalizedTotalPages) },
        (_, index) => index + 1,
      ),
    [maxVisiblePages, normalizedTotalPages],
  );

  const handlePageChange = (page: number): void => {
    const nextPage = clampPage(page, normalizedTotalPages);
    if (nextPage !== normalizedCurrentPage) {
      onPageChange?.(nextPage);
    }
  };

  const commitPageInput = (): void => {
    const parsedPage = Number.parseInt(pageInput, 10);
    if (Number.isNaN(parsedPage)) {
      setPageInput(String(normalizedCurrentPage));
      return;
    }

    const nextPage = clampPage(parsedPage, normalizedTotalPages);
    setPageInput(String(nextPage));
    handlePageChange(nextPage);
  };

  const rangeLabel =
    rangeVariant === "detailed"
      ? totalItems > 0
        ? `Showing ${String(startRow)}-${String(endRow)} of ${String(totalItems)} results`
        : "No results"
      : `Showing ${String(startRow)} - ${String(endRow)}`;

  return (
    <div className={cn(paginationVariants({ density }), className)}>
      <div className={cn(rangeLabelVariants({ rangeVariant }))}>
        {rangeLabel}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={normalizedCurrentPage === 1}
          onClick={() => {
            handlePageChange(1);
          }}
          aria-label="Go to first page"
          className={cn(navButtonVariants())}
        >
          <DoubleAltArrowLeft size={16} />
        </button>
        <button
          type="button"
          disabled={normalizedCurrentPage === 1}
          onClick={() => {
            handlePageChange(normalizedCurrentPage - 1);
          }}
          aria-label="Go to previous page"
          className={cn(navButtonVariants())}
        >
          <AltArrowLeft size={16} />
        </button>

        {pageControl === "buttons" ? (
          <div className={cn(pageControlVariants({ pageControl }))}>
            {visiblePages.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => {
                  handlePageChange(pageNumber);
                }}
                className={cn(
                  pageButtonVariants({
                    active: normalizedCurrentPage === pageNumber,
                  }),
                )}
              >
                {pageNumber}
              </button>
            ))}
            {normalizedTotalPages > maxVisiblePages ? (
              <span className="text-muted-foreground text-[10px]">...</span>
            ) : null}
          </div>
        ) : null}

        {pageControl === "text" ? (
          <div className={cn(pageControlVariants({ pageControl }))}>
            Page {String(normalizedCurrentPage)} of{" "}
            {String(normalizedTotalPages)}
          </div>
        ) : null}

        {pageControl === "input" ? (
          <form
            className={cn(pageControlVariants({ pageControl }))}
            onSubmit={(event) => {
              event.preventDefault();
              commitPageInput();
            }}
          >
            <span>Page</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="Enter page number"
              value={pageInput}
              onChange={(event) => {
                setPageInput(event.target.value.replace(/[^\d]/g, ""));
              }}
              onBlur={commitPageInput}
              className={cn(pageInputVariants())}
            />
            <span>of {String(normalizedTotalPages)}</span>
          </form>
        ) : null}

        <button
          type="button"
          disabled={normalizedCurrentPage === normalizedTotalPages}
          onClick={() => {
            handlePageChange(normalizedCurrentPage + 1);
          }}
          aria-label="Go to next page"
          className={cn(navButtonVariants())}
        >
          <AltArrowRight size={16} />
        </button>
        <button
          type="button"
          disabled={normalizedCurrentPage === normalizedTotalPages}
          onClick={() => {
            handlePageChange(normalizedTotalPages);
          }}
          aria-label="Go to last page"
          className={cn(navButtonVariants())}
        >
          <DoubleAltArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

export {
  Pagination,
  type PaginationDensity,
  type PaginationPageControl,
  type PaginationProps,
  type PaginationRangeVariant,
};
