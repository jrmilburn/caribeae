"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type DateSelectorProps = {
  availableDateKeys: string[];
  selectedDateKey: string | null;
  onChange: (dateKey: string) => void;
  disabled?: boolean;
  autoSelectKey?: string | null;
  className?: string;
};

export function DateSelector({
  availableDateKeys,
  selectedDateKey,
  onChange,
  disabled,
  autoSelectKey,
  className,
}: DateSelectorProps) {
  const sortedDates = React.useMemo(() => [...availableDateKeys].sort(), [availableDateKeys]);

  React.useEffect(() => {
    if (!autoSelectKey) return;
    if (selectedDateKey && selectedDateKey === autoSelectKey) return;
    onChange(autoSelectKey);
  }, [autoSelectKey, onChange, selectedDateKey]);

  return (
    <div className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm", className)}>
      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
      <Select
        value={selectedDateKey ?? undefined}
        onValueChange={onChange}
        disabled={disabled || !sortedDates.length}
      >
        <SelectTrigger
          aria-label="Change occurrence date"
          className={cn(
            "h-8 w-full min-w-0 bg-background px-2 text-sm sm:w-[190px]",
            disabled && "cursor-not-allowed"
          )}
        >
          <SelectValue placeholder="Change date" />
        </SelectTrigger>
        <SelectContent>
          {sortedDates.map((dateKey) => (
            <SelectItem key={dateKey} value={dateKey} className="text-sm">
              {formatDisplayDate(dateKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function formatDisplayDate(dateKey: string) {
  const parsed = parseISO(dateKey);
  return format(parsed, "EEE, dd MMM yyyy");
}
