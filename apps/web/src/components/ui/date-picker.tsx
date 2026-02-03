import * as Popover from "@radix-ui/react-popover";
import { AltArrowLeft, AltArrowRight } from "@solar-icons/react";
import * as React from "react";

import { cn } from "@/lib/utils";

const YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function toLocalDateString(date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseLocalDate(value: string): Date | null {
  if (!YYYY_MM_DD_REGEX.test(value)) {
    return null;
  }
  const [yyyyRaw, mmRaw, ddRaw] = value.split("-");
  const yyyy = Number(yyyyRaw);
  const mm = Number(mmRaw);
  const dd = Number(ddRaw);
  if (
    !Number.isInteger(yyyy) ||
    !Number.isInteger(mm) ||
    !Number.isInteger(dd)
  ) {
    return null;
  }

  const date = new Date(yyyy, mm - 1, dd);
  if (
    date.getFullYear() !== yyyy ||
    date.getMonth() !== mm - 1 ||
    date.getDate() !== dd
  ) {
    return null;
  }
  return date;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getMonthLabel(date: Date): string {
  return date.toLocaleString(undefined, { month: "long", year: "numeric" });
}

export interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function DatePicker({
  id,
  value,
  onChange,
  min,
  placeholder = "YYYY-MM-DD",
  disabled,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const viewBase = React.useMemo(() => {
    const parsedValue = parseLocalDate(value);
    if (parsedValue) {
      return parsedValue;
    }
    const parsedMin = min ? parseLocalDate(min) : null;
    if (parsedMin) {
      return parsedMin;
    }
    return new Date();
  }, [min, value]);

  const [viewMonth, setViewMonth] = React.useState(() =>
    startOfMonth(viewBase),
  );

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setViewMonth(startOfMonth(viewBase));
  }, [open, viewBase]);

  const daysInMonth = getDaysInMonth(viewMonth);
  const firstDayOfWeek = startOfMonth(viewMonth).getDay(); // 0=Sun

  const selected = value ? parseLocalDate(value) : null;
  const minString = min && YYYY_MM_DD_REGEX.test(min) ? min : undefined;

  const handleSelectDay = (day: number) => {
    const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    const nextString = toLocalDateString(next);
    if (minString && nextString < minString) {
      return;
    }
    onChange(nextString);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <input
          id={id}
          type="text"
          inputMode="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(className)}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="z-50 w-[280px] rounded-md border border-border bg-card p-3 shadow-lg"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-muted text-foreground hover:border-primary/60 disabled:opacity-50"
              onClick={() => setViewMonth((prev) => addMonths(prev, -1))}
              aria-label="Previous month"
            >
              <AltArrowLeft size={16} />
            </button>
            <div className="text-xs font-bold text-foreground">
              {getMonthLabel(viewMonth)}
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-muted text-foreground hover:border-primary/60 disabled:opacity-50"
              onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
              aria-label="Next month"
            >
              <AltArrowRight size={16} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <div className="text-center">S</div>
            <div className="text-center">M</div>
            <div className="text-center">T</div>
            <div className="text-center">W</div>
            <div className="text-center">T</div>
            <div className="text-center">F</div>
            <div className="text-center">S</div>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
              <div key={`pad-${idx}`} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const date = new Date(
                viewMonth.getFullYear(),
                viewMonth.getMonth(),
                day,
              );
              const dateString = toLocalDateString(date);
              const isDisabled = Boolean(minString && dateString < minString);
              const isSelected =
                selected?.getFullYear() === date.getFullYear() &&
                selected.getMonth() === date.getMonth() &&
                selected.getDate() === date.getDate();

              return (
                <button
                  key={dateString}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelectDay(day)}
                  className={cn(
                    "h-9 w-9 rounded text-xs transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground hover:border-primary/60 hover:bg-muted/70",
                    "border border-border",
                    isDisabled &&
                      "opacity-40 cursor-not-allowed hover:bg-muted",
                  )}
                  aria-label={dateString}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-[10px] text-muted-foreground">
              {placeholder}
            </div>
            <button
              type="button"
              className="text-[10px] font-bold uppercase tracking-wider text-primary hover:text-primary-400"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
