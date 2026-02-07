import { Magnifer } from "@solar-icons/react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

interface DataTableToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  debounceMs?: number;
  children?: React.ReactNode;
  className?: string;
}

function DataTableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  debounceMs = 300,
  children,
  className,
}: DataTableToolbarProps) {
  const [localValue, setLocalValue] = useState(searchValue);
  const debouncedValue = useDebouncedValue(localValue, debounceMs);

  useEffect(() => {
    onSearchChange(debouncedValue);
  }, [debouncedValue, onSearchChange]);

  useEffect(() => {
    setLocalValue(searchValue);
  }, [searchValue]);

  return (
    <div
      className={cn("flex items-center justify-between gap-3 py-2", className)}
    >
      <div className="relative flex-1 max-w-sm">
        <Magnifer
          weight="Linear"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
        />
        <Input
          value={localValue}
          onChange={(e) => {
            setLocalValue(e.target.value);
          }}
          placeholder={searchPlaceholder}
          className="h-8 pl-8 text-xs"
        />
      </div>

      {children ? (
        <div className="flex items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

export { DataTableToolbar, type DataTableToolbarProps };
