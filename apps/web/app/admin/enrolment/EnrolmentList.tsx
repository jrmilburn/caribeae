"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Search, X, MoreVerticalIcon, MoreHorizontalIcon } from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

import type { Prisma } from "@prisma/client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import EnrolmentListItem from "./EnrolmentListItem";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import { deleteEnrolment } from "@/server/enrolment/deleteEnrolment";

export type EnrolmentWithStudentAndPlan = Prisma.EnrolmentGetPayload<{
  include: { student: true; plan: true };
}>;

export default function EnrolmentList({
  enrolments,
}: {
  enrolments: EnrolmentWithStudentAndPlan[];
}) {
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");

  // selection
  const [selectedIds, setSelectedIds] = React.useState<Record<string, boolean>>({});

  const filteredEnrolments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return enrolments;

    return enrolments.filter((e) => {
      const studentName = e.student?.name?.toLowerCase() ?? "";
      const planName = e.plan?.name?.toLowerCase() ?? "";
      const status = String(e.status ?? "").toLowerCase();

      const startStr = format(e.startDate, "EEE dd MMM yyyy").toLowerCase();
      const endStr = e.endDate ? format(e.endDate, "EEE dd MMM yyyy").toLowerCase() : "";

      return (
        studentName.includes(q) ||
        planName.includes(q) ||
        status.includes(q) ||
        startStr.includes(q) ||
        endStr.includes(q)
      );
    });
  }, [enrolments, searchTerm]);

  const filteredIds = useMemo(
    () => filteredEnrolments.map((e) => e.id),
    [filteredEnrolments]
  );

  const selectedFilteredIds = useMemo(
    () => filteredIds.filter((id) => selectedIds[id]),
    [filteredIds, selectedIds]
  );

  const allFilteredSelected =
    filteredIds.length > 0 && selectedFilteredIds.length === filteredIds.length;

  const someFilteredSelected =
    selectedFilteredIds.length > 0 && selectedFilteredIds.length < filteredIds.length;

  const toggleOne = (id: string, next: boolean) =>
    setSelectedIds((prev) => ({ ...prev, [id]: next }));

  const toggleAllFiltered = (next: boolean) => {
    setSelectedIds((prev) => {
      const copy = { ...prev };
      for (const id of filteredIds) copy[id] = next;
      return copy;
    });
  };

  const clearSelection = () => setSelectedIds({});

  const deleteSelected = async () => {
    if (selectedFilteredIds.length === 0) return;
    const ok = window.confirm(`Delete ${selectedFilteredIds.length} selected enrolments?`);
    if (!ok) return;

    for (const id of selectedFilteredIds) {
      await deleteEnrolment(id);
    }
    router.refresh();
    clearSelection();
  };

  return (
    <div className="w-full max-h-screen h-full">
      <EnrolmentListHeader
        title="Enrolments"
        totalCount={enrolments.length}
        filteredCount={filteredEnrolments.length}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        // selection controls
        allSelected={allFilteredSelected}
        someSelected={someFilteredSelected}
        selectedCount={selectedFilteredIds.length}
        onToggleAll={toggleAllFiltered}
        onClearSelection={clearSelection}
        onDeleteSelected={deleteSelected}
      />

      <div className="max-h-[calc(100vh]">
        {filteredEnrolments.map((e) => (
          <EnrolmentListItem
            key={e.id}
            enrolment={e}
            checked={!!selectedIds[e.id]}
            onCheckedChange={(next) => toggleOne(e.id, next)}
          />
        ))}

        {filteredEnrolments.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            No enrolments found{searchTerm.trim() ? ` for “${searchTerm.trim()}”` : ""}.
          </div>
        )}
      </div>
    </div>
  );
}

function EnrolmentListHeader({
  title,
  totalCount,
  filteredCount,
  searchTerm,
  setSearchTerm,

  allSelected,
  someSelected,
  selectedCount,
  onToggleAll,
  onClearSelection,
  onDeleteSelected,
}: {
  title: string;
  totalCount: number;
  filteredCount: number;

  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;

  allSelected: boolean;
  someSelected: boolean;
  selectedCount: number;
  onToggleAll: (next: boolean) => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
}) {
  const router = useRouter();
  const hasQuery = searchTerm.trim().length > 0;

  return (
    <>
      {/* Top header row */}
      <div className="mb-3 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">{title}</h2>
            <span className="text-xs text-muted-foreground">
              {hasQuery ? `${filteredCount} / ${totalCount}` : totalCount}
            </span>
            {selectedCount > 0 ? (
              <span className="text-xs text-muted-foreground">• {selectedCount} selected</span>
            ) : null}
          </div>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-[340px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearchTerm("");
              }}
              placeholder="Search enrolments…"
              className={cn("pl-9 pr-10")}
            />

            {hasQuery && (
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
            )}
          </div>

          {/* Horizontal dots menu (top-right) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open page actions">
                <MoreHorizontalIcon className="h-7 w-7 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  router.push("/admin/enrolment/new");
                }}
              >
                New
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                disabled={selectedCount === 0}
                onSelect={(e) => {
                  e.preventDefault();
                  onDeleteSelected();
                }}
                className="text-destructive focus:text-destructive"
              >
                Delete selected
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={selectedCount === 0}
                onSelect={(e) => {
                  e.preventDefault();
                  onClearSelection();
                }}
              >
                Clear selection
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Column header row */}
      <div className="flex h-14 w-full items-center justify-between border-t border-b border-border bg-card px-4 bg-gray-50">
        <div className="flex w-10 items-center justify-center">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (!el) return;
              el.indeterminate = someSelected;
            }}
            onChange={(e) => onToggleAll(e.target.checked)}
            aria-label="Select all enrolments"
            className="h-4 w-4"
          />
        </div>

        <div className="truncate text-sm font-medium flex-1">Student</div>
        <div className="truncate text-sm font-medium flex-1">Start</div>
        <div className="truncate text-sm font-medium flex-1">End</div>
        <div className="truncate text-sm font-medium flex-1">Plan</div>

        {/* keep right-side dots for row actions symmetry (optional) */}
        <div className="flex w-10 items-center justify-center">
          <MoreVerticalIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </>
  );
}
