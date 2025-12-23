"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Search, X, MoreHorizontalIcon, MoreVerticalIcon } from "lucide-react";

import type { EnrolmentListItem } from "@/server/enrolment/getEnrolmentsListData";
import { cancelEnrolment } from "@/server/enrolment/cancelEnrolment";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import EnrolmentListItemRow from "./EnrolmentListItem";

export default function EnrolmentList({ enrolments }: { enrolments: EnrolmentListItem[] }) {
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return enrolments;

    return enrolments.filter((enrolment) => {
      const studentName = enrolment.student?.name?.toLowerCase() ?? "";
      const familyName = enrolment.student?.family?.name?.toLowerCase() ?? "";
      const templateName = enrolment.template?.name?.toLowerCase() ?? "";
      const levelName = enrolment.template?.level?.name?.toLowerCase() ?? "";
      const status = enrolment.status?.toLowerCase() ?? "";
      const startDateStr = format(new Date(enrolment.startDate), "dd MMM yyyy").toLowerCase();

      if (studentName.includes(q)) return true;
      if (familyName.includes(q)) return true;
      if (templateName.includes(q)) return true;
      if (levelName.includes(q)) return true;
      if (status.includes(q)) return true;
      if (startDateStr.includes(q)) return true;
      return false;
    });
  }, [enrolments, searchTerm]);

  const filteredIds = useMemo(() => filtered.map((e) => e.id), [filtered]);
  const selectedFilteredIds = useMemo(
    () => filteredIds.filter((id) => selectedIds[id]),
    [filteredIds, selectedIds]
  );

  const allFilteredSelected =
    filteredIds.length > 0 && selectedFilteredIds.length === filteredIds.length;
  const someFilteredSelected =
    selectedFilteredIds.length > 0 && selectedFilteredIds.length < filteredIds.length;

  const toggleOne = (id: string, next: boolean) => {
    setSelectedIds((prev) => ({ ...prev, [id]: next }));
  };

  const toggleAllFiltered = (next: boolean) => {
    setSelectedIds((prev) => {
      const copy = { ...prev };
      for (const id of filteredIds) copy[id] = next;
      return copy;
    });
  };

  const clearSelection = () => setSelectedIds({});

  const openStart = () => router.push("/admin/enrolment/start");

  const viewStudent = (enrolment: EnrolmentListItem) =>
    router.push(`/admin/student/${enrolment.studentId}`);

  const handleCancel = async (enrolment: EnrolmentListItem) => {
    const ok = window.confirm("Cancel this enrolment?");
    if (!ok) return;
    await cancelEnrolment(enrolment.id);
    router.refresh();
    toggleOne(enrolment.id, false);
  };

  const cancelSelected = async () => {
    if (selectedFilteredIds.length === 0) return;
    const ok = window.confirm(`Cancel ${selectedFilteredIds.length} selected enrolments?`);
    if (!ok) return;

    for (const id of selectedFilteredIds) {
      await cancelEnrolment(id);
    }
    router.refresh();
    clearSelection();
  };

  return (
    <div className="w-full max-h-screen h-full">
      <ListHeader
        title="Enrolments"
        totalCount={enrolments.length}
        filteredCount={filtered.length}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onStart={openStart}
        // selection
        allSelected={allFilteredSelected}
        someSelected={someFilteredSelected}
        selectedCount={selectedFilteredIds.length}
        onToggleAll={toggleAllFiltered}
        onClearSelection={clearSelection}
        onCancelSelected={cancelSelected}
      />

      <div>
        {filtered.map((enrolment) => (
          <EnrolmentListItemRow
            key={enrolment.id}
            enrolment={enrolment}
            checked={!!selectedIds[enrolment.id]}
            onCheckedChange={(next) => toggleOne(enrolment.id, next)}
            onView={viewStudent}
            onCancel={handleCancel}
          />
        ))}

        {filtered.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            No enrolments found{searchTerm.trim() ? ` for “${searchTerm.trim()}”` : ""}.
          </div>
        )}
      </div>
    </div>
  );
}

function ListHeader({
  title,
  totalCount,
  filteredCount,
  searchTerm,
  setSearchTerm,
  onStart,

  allSelected,
  someSelected,
  selectedCount,
  onToggleAll,
  onClearSelection,
  onCancelSelected,
}: {
  title: string;
  totalCount: number;
  filteredCount: number;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  onStart: () => void;

  allSelected: boolean;
  someSelected: boolean;
  selectedCount: number;
  onToggleAll: (next: boolean) => void;
  onClearSelection: () => void;
  onCancelSelected: () => void;
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
                  router.push("/admin/class");
                }}
              >
                Classes
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onStart();
                }}
              >
                New enrolment
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Column header row */}
      <div className="flex h-14 w-full items-center justify-between border-t border-b border-border bg-card px-4 bg-gray-50">
        {/* Select all checkbox */}
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

        <div className="truncate text-sm font-medium flex-[1.1] min-w-[160px]">Student</div>
        <div className="truncate text-sm font-medium flex-[1.2] min-w-[200px]">Class</div>
        <div className="truncate text-sm font-medium flex-1 min-w-[140px]">Start date</div>
        <div className="truncate text-sm font-medium w-[140px] text-right">Status</div>

        {/* Vertical dots menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open enrolment actions"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVerticalIcon className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              disabled={selectedCount === 0}
              onSelect={(e) => {
                e.preventDefault();
                onCancelSelected();
              }}
            >
              Cancel selected
            </DropdownMenuItem>

            <DropdownMenuSeparator />

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
    </>
  );
}
