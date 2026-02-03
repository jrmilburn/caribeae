"use client";

import * as React from "react";
import { Loader2, Search, Users, UserRound, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { searchReception, type ReceptionSearchResults } from "@/server/reception/searchReception";

const EMPTY_RESULTS: ReceptionSearchResults = { families: [], students: [] };

type SearchRow =
  | { kind: "family"; id: string; familyId: string; label: string; subLabel: string }
  | { kind: "student"; id: string; familyId: string; label: string; subLabel: string };

export function ReceptionSearch({
  onSelectFamily,
  onSelectStudent,
}: {
  onSelectFamily: (familyId: string) => void;
  onSelectStudent: (familyId: string, studentId: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<ReceptionSearchResults>(EMPTY_RESULTS);
  const [searching, setSearching] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [highlightIndex, setHighlightIndex] = React.useState(-1);

  const flatResults = React.useMemo<SearchRow[]>(() => {
    const familyRows: SearchRow[] = results.families.map((family) => ({
      kind: "family",
      id: family.id,
      familyId: family.id,
      label: family.name,
      subLabel: family.primaryContactName || family.primaryPhone || family.primaryEmail || "Family",
    }));
    const studentRows: SearchRow[] = results.students.map((student) => ({
      kind: "student",
      id: student.id,
      familyId: student.familyId,
      label: student.name,
      subLabel: `${student.familyName}${student.levelName ? ` · ${student.levelName}` : ""}`,
    }));
    return [...familyRows, ...studentRows];
  }, [results]);

  const clearSearch = React.useCallback(() => {
    setQuery("");
    setResults(EMPTY_RESULTS);
    setOpen(false);
    setHighlightIndex(-1);
  }, []);

  const handleSelect = React.useCallback(
    (row: SearchRow) => {
      if (row.kind === "family") {
        onSelectFamily(row.familyId);
      } else {
        onSelectStudent(row.familyId, row.id);
      }
      clearSearch();
    },
    [clearSearch, onSelectFamily, onSelectStudent]
  );

  React.useEffect(() => {
    if (!query.trim()) {
      setResults(EMPTY_RESULTS);
      setSearching(false);
      setOpen(false);
      setHighlightIndex(-1);
      return;
    }

    let active = true;
    const handle = window.setTimeout(() => {
      setSearching(true);
      searchReception(query)
        .then((res) => {
          if (!active) return;
          setResults(res);
          setOpen(true);
        })
        .catch(() => {
          if (!active) return;
          setResults(EMPTY_RESULTS);
        })
        .finally(() => {
          if (!active) return;
          setSearching(false);
          setHighlightIndex(-1);
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [query]);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(Boolean(query.trim()) || results.families.length > 0 || results.students.length > 0);
        return;
      }

      if (event.key === "Escape" && open) {
        event.preventDefault();
        clearSearch();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clearSearch, open, query, results.families.length, results.students.length]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setHighlightIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    }

    if (event.key === "Enter" && flatResults.length > 0) {
      event.preventDefault();
      const index = highlightIndex >= 0 ? highlightIndex : 0;
      const row = flatResults[index];
      if (row) handleSelect(row);
    }

    if (event.key === "Escape") {
      event.preventDefault();
      clearSearch();
    }
  };

  const showResults = open && (searching || flatResults.length > 0 || query.trim().length > 0);
  const hasQuery = query.trim().length > 0;

  return (
    <div className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          placeholder="Search families or students..."
          className="pl-9 pr-20"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {searching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          {hasQuery ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearSearch}
              className="h-7 w-7"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <kbd className="rounded border bg-muted px-2 py-1 text-[10px] text-muted-foreground">/</kbd>
          )}
        </div>
      </div>

      {showResults ? (
        <div className="absolute left-0 right-0 z-30 mt-2 rounded-md border bg-popover p-2 shadow-sm">
          {flatResults.length === 0 && !searching ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No matches found.</div>
          ) : (
            <div className="space-y-2">
              {results.families.length > 0 ? (
                <div>
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Families
                  </div>
                  <div className="grid gap-1">
                    {results.families.map((family) => {
                      const rowIndex = flatResults.findIndex((row) => row.kind === "family" && row.id === family.id);
                      return (
                        <button
                          key={family.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition hover:bg-accent",
                            rowIndex === highlightIndex && "bg-accent"
                          )}
                          onClick={() =>
                            handleSelect({
                              kind: "family",
                              id: family.id,
                              familyId: family.id,
                              label: family.name,
                              subLabel:
                                family.primaryContactName || family.primaryPhone || family.primaryEmail || "Family",
                            })
                          }
                        >
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{family.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {family.primaryContactName || family.primaryPhone || family.primaryEmail || "Family"}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {results.students.length > 0 ? (
                <div>
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Students
                  </div>
                  <div className="grid gap-1">
                    {results.students.map((student) => {
                      const rowIndex = flatResults.findIndex((row) => row.kind === "student" && row.id === student.id);
                      return (
                        <button
                          key={student.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition hover:bg-accent",
                            rowIndex === highlightIndex && "bg-accent"
                          )}
                          onClick={() =>
                            handleSelect({
                              kind: "student",
                              id: student.id,
                              familyId: student.familyId,
                              label: student.name,
                              subLabel: `${student.familyName}${student.levelName ? ` · ${student.levelName}` : ""}`,
                            })
                          }
                        >
                          <UserRound className="h-4 w-4 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{student.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {student.familyName}
                              {student.levelName ? ` · ${student.levelName}` : ""}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
