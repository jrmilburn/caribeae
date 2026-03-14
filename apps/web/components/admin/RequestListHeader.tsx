"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type FilterOption = {
  value: string;
  label: string;
};

type RequestListHeaderProps = {
  title: string;
  totalCount: number;
  searchPlaceholder: string;
  filterValue?: string;
  filterOptions?: readonly FilterOption[];
  allFilterValue?: string;
  filterParam?: string;
  filterWidthClassName?: string;
};

export function RequestListHeader({
  title,
  totalCount,
  searchPlaceholder,
  filterValue,
  filterOptions,
  allFilterValue = "all",
  filterParam = "status",
  filterWidthClassName,
}: RequestListHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentQuery = searchParams.get("q") ?? "";
  const [searchTerm, setSearchTerm] = React.useState(currentQuery);

  React.useEffect(() => {
    setSearchTerm(currentQuery);
  }, [currentQuery]);

  const replaceWithParams = React.useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router]
  );

  const applySearch = React.useCallback(
    (nextQuery: string) => {
      const normalized = nextQuery.trim();
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
      replaceWithParams(params);
    },
    [currentQuery, replaceWithParams, searchParams]
  );

  React.useEffect(() => {
    const timeout = window.setTimeout(() => applySearch(searchTerm), 250);
    return () => window.clearTimeout(timeout);
  }, [applySearch, searchTerm]);

  const hasQuery = searchTerm.trim().length > 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-4">
      <div>
        <div className="text-base font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{totalCount} total requests</div>
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <div className="relative w-full sm:w-[320px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applySearch(searchTerm);
              }
              if (event.key === "Escape") {
                setSearchTerm("");
              }
            }}
            placeholder={searchPlaceholder}
            className="h-9 pl-9 pr-10"
          />
          {hasQuery ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                setSearchTerm("");
                applySearch("");
              }}
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {filterValue && filterOptions?.length ? (
          <Select
            value={filterValue}
            onValueChange={(value) => {
              const params = new URLSearchParams(searchParams.toString());
              if (value === allFilterValue) {
                params.delete(filterParam);
              } else {
                params.set(filterParam, value);
              }
              params.delete("cursor");
              params.delete("cursors");
              replaceWithParams(params);
            }}
          >
            <SelectTrigger className={cn("h-9 w-[160px]", filterWidthClassName)}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {filterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
    </div>
  );
}
