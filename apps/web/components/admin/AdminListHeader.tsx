"use client";

import * as React from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/server/pagination";

type AdminListHeaderProps = {
  title: string;
  totalCount: number;
  searchPlaceholder: string;
  newLabel?: string;
  onNew: () => void;
  showFilters?: boolean;
  sticky?: boolean;
};

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}

export function AdminListHeader({
  title,
  totalCount,
  searchPlaceholder,
  newLabel = "New",
  onNew,
  showFilters,
  sticky,
}: AdminListHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentQuery = searchParams.get("q") ?? "";
  const currentPageSize = Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE;

  const [searchTerm, setSearchTerm] = React.useState(currentQuery);
  const debouncedSearch = useDebouncedValue(searchTerm);

  React.useEffect(() => {
    setSearchTerm(currentQuery);
  }, [currentQuery]);

  React.useEffect(() => {
    const normalized = debouncedSearch.trim();
    const current = currentQuery.trim();
    if (normalized === current) return;

    const params = new URLSearchParams(searchParams.toString());
    if (normalized) {
      params.set("q", normalized);
    } else {
      params.delete("q");
    }
    params.delete("cursor");
    params.delete("cursors");

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [debouncedSearch, currentQuery, pathname, router, searchParams]);

  const hasQuery = searchTerm.trim().length > 0;
  const pageSize = PAGE_SIZE_OPTIONS.includes(currentPageSize as (typeof PAGE_SIZE_OPTIONS)[number])
    ? currentPageSize
    : DEFAULT_PAGE_SIZE;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b bg-card px-4 py-4 sm:flex-row sm:items-center",
        sticky && "sticky top-0 z-10"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Badge variant="secondary" className="rounded-full px-2">
          {totalCount}
        </Badge>
      </div>

      <div className="w-full sm:flex-1 sm:px-4">
        <div className="relative w-full sm:mx-auto sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSearchTerm("");
            }}
            placeholder={searchPlaceholder}
            className="pl-9 pr-10"
          />
          {hasQuery ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSearchTerm("")}
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select
          value={String(pageSize)}
          onValueChange={(value) => {
            const next = Number(value) || DEFAULT_PAGE_SIZE;
            const params = new URLSearchParams(searchParams.toString());
            params.set("pageSize", String(next));
            params.delete("cursor");
            params.delete("cursors");
            const qs = params.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname);
          }}
        >
          <SelectTrigger className="h-9 w-[120px]">
            <SelectValue placeholder="Page size" />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showFilters ? (
          <Button variant="outline" size="sm" type="button">
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters
          </Button>
        ) : null}

        <Button size="sm" onClick={onNew}>
          {newLabel}
        </Button>
      </div>
    </div>
  );
}
