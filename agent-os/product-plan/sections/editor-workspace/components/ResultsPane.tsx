import type { ExecutionResult } from '@/../product/sections/editor-workspace/types';
import { AltArrowLeft, AltArrowRight, InfoCircle, LinkCircle, DoubleAltArrowLeft, DoubleAltArrowRight } from '@solar-icons/react';
import { cn } from '@/lib/utils';

interface ResultsPaneProps {
  result: ExecutionResult;
  onPageChange?: (page: number) => void;
  onViewInContactBuilder?: () => void;
}

export function ResultsPane({ result, onPageChange, onViewInContactBuilder }: ResultsPaneProps) {
  const totalPages = Math.ceil(result.totalRows / result.pageSize);

  return (
    <div className="flex flex-col h-full bg-background animate-fade-in">
      {/* Results Header */}
      <div className="h-9 border-y border-border bg-card/50 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <InfoCircle size={14} className="text-primary" />
          <span>{result.status === 'success' ? `Query executed in ${result.runtime} • ${result.totalRows} records found` : 'Awaiting execution...'}</span>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={onViewInContactBuilder}
            className="flex items-center gap-1.5 text-[11px] font-bold text-primary hover:text-primary-400 transition-colors"
          >
            <LinkCircle size={14} />
            View in Contact Builder
          </button>
        </div>
      </div>

      {/* Data Grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur shadow-sm z-10">
            <tr>
              {result.columns.map(col => (
                <th key={col} className="p-2.5 border-r border-border font-bold text-muted-foreground bg-muted/50">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {result.rows.map((row, i) => (
              <tr key={i} className="hover:bg-primary/5 transition-colors group">
                {result.columns.map(col => (
                  <td key={col} className="p-2.5 border-r border-border/50 text-foreground/80 group-hover:text-foreground">
                    {row[col]}
                  </td>
                ))}
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={result.columns.length} className="p-12 text-center text-muted-foreground">
                  No data returned for this query.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Intelligent Pagination */}
      <div className="h-10 border-t border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          Showing {((result.currentPage - 1) * result.pageSize) + 1} - {Math.min(result.currentPage * result.pageSize, result.totalRows)}
        </div>

        <div className="flex items-center gap-1">
          <button 
            disabled={result.currentPage === 1}
            onClick={() => onPageChange?.(1)}
            className="p-1.5 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
          >
            <DoubleAltArrowLeft size={16} />
          </button>
          <button 
            disabled={result.currentPage === 1}
            onClick={() => onPageChange?.(result.currentPage - 1)}
            className="p-1.5 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
          >
            <AltArrowLeft size={16} />
          </button>

          <div className="flex items-center gap-1 px-2">
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange?.(pageNum)}
                  className={cn(
                    "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-all",
                    result.currentPage === pageNum 
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/40" 
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            {totalPages > 5 && <span className="text-muted-foreground text-[10px]">...</span>}
          </div>

          <button 
            disabled={result.currentPage === totalPages}
            onClick={() => onPageChange?.(result.currentPage + 1)}
            className="p-1.5 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
          >
            <AltArrowRight size={16} />
          </button>
          <button 
            disabled={result.currentPage === totalPages}
            onClick={() => onPageChange?.(totalPages)}
            className="p-1.5 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
          >
            <DoubleAltArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
