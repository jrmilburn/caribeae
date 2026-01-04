"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ClassFilterOption } from "@/server/communication/getClassFilterOptions";
import { cn } from "@/lib/utils";

type ClassFilterProps = {
  options: ClassFilterOption[];
  selectedIds: string[];
};

function useDebouncedValue<T>(value: T, delay = 200) {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toTimeLabel(minutes: number | null) {
  if (minutes === null || minutes === undefined) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function formatSchedule(option: ClassFilterOption) {
  const day = typeof option.dayOfWeek === "number" ? DAY_LABELS[option.dayOfWeek] : null;
  const start = toTimeLabel(option.startTime);
  const end = toTimeLabel(option.endTime);

  if (day && start && end) return `${day} ${start}–${end}`;
  if (day && start) return `${day} ${start}`;
  if (day) return day;
  return "Schedule TBD";
}

export function ClassFilter({ options, selectedIds }: ClassFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const debouncedSearch = useDebouncedValue(search);

  React.useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const orderedIds = React.useMemo(() => options.map((o) => o.id), [options]);
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  const filteredOptions = React.useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return options;

    return options.filter((option) => {
      const label = `${option.name ?? "Untitled"} ${formatSchedule(option)} ${option.levelName ?? ""}`;
      return label.toLowerCase().includes(term);
    });
  }, [options, debouncedSearch]);

  const applySelection = React.useCallback(
    (nextIds: Set<string>) => {
      const ordered = orderedIds.filter((id) => nextIds.has(id));
      const params = new URLSearchParams(searchParams.toString());
      params.delete("classIds");
      ordered.forEach((id) => params.append("classIds", id));

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
      router.refresh();
    },
    [orderedIds, pathname, router, searchParams]
  );

  const toggleClass = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    applySelection(next);
  };

  const clearAll = () => {
    if (!selectedSet.size) return;
    applySelection(new Set());
  };

  const selectedClasses = React.useMemo(
    () => options.filter((option) => selectedSet.has(option.id)),
    [options, selectedSet]
  );

  const countLabel = selectedSet.size ? `Select classes (${selectedSet.size})` : "Select classes";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs font-semibold text-muted-foreground">Classes</div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="min-w-[180px] justify-between">
              <span className="truncate">{countLabel}</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-0" align="start">
            <Command>
              <CommandInput
                autoFocus
                placeholder="Search classes…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <CommandList>
                {filteredOptions.length === 0 ? (
                  <CommandEmpty>No classes found.</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filteredOptions.map((option) => {
                      const selected = selectedSet.has(option.id);
                      return (
                        <CommandItem key={option.id} onClick={() => toggleClass(option.id)}>
                          <div
                            className={cn(
                              "flex h-4 w-4 items-center justify-center rounded-sm border",
                              selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"
                            )}
                          >
                            {selected ? <Check className="h-3 w-3" /> : null}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <span className="truncate">{option.name || "Untitled"}</span>
                              {!option.active ? (
                                <Badge variant="outline" className="h-5 px-2 text-[11px]">
                                  Inactive
                                </Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {[formatSchedule(option), option.levelName ?? "—"].filter(Boolean).join(" • ")}
                            </div>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {selectedSet.size ? (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground">
            Clear
          </Button>
        ) : null}
      </div>

      {selectedClasses.length ? (
        <div className="flex flex-wrap gap-2">
          {selectedClasses.map((option) => (
            <Badge
              key={option.id}
              variant="secondary"
              className="flex items-center gap-1 rounded-full px-3 py-1 text-xs"
            >
              <span className="truncate max-w-[200px]">{option.name || "Untitled"}</span>
              <button
                type="button"
                onClick={() => toggleClass(option.id)}
                className="ml-1 flex rounded-full p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label={`Remove ${option.name ?? "class"}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
