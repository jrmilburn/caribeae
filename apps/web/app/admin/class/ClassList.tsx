"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Search, X, MoreVerticalIcon, MoreHorizontalIcon } from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

import type { Prisma, Level } from "@prisma/client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import ClassListItem from "./ClassListItem";
import { ClassInstanceModal } from "./ClassInstanceModal";

import { createClassInstance } from "@/server/classInstance/createClassInstance";
import { updateClassInstance } from "@/server/classInstance/updateClassInstance";
import { deleteClassInstance } from "@/server/classInstance/deleteClassInstance";
import type { ClientClassInstance } from "@/server/classInstance/types";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export type InstanceWithLevelAndTemplate = Prisma.ClassInstanceGetPayload<{
  include: { level: true; template: true };
}>;

export default function ClassList({
  instances,
  levels,
}: {
  instances: InstanceWithLevelAndTemplate[];
  levels: Level[];
}) {
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] =
    React.useState<InstanceWithLevelAndTemplate | null>(null);

  // selection
  const [selectedIds, setSelectedIds] = React.useState<Record<string, boolean>>({});

  const filteredInstances = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return instances;

    return instances.filter((i) => {
      const templateName = i.template?.name?.toLowerCase() ?? "";
      const levelName = i.level?.name?.toLowerCase() ?? "";
      const status = i.status?.toLowerCase() ?? "";
      const dateStr = format(i.startTime, "EEE dd MMM yyyy").toLowerCase();
      const timeStr = format(i.startTime, "h:mm a").toLowerCase();

      if (templateName.includes(q)) return true;
      if (levelName.includes(q)) return true;
      if (status.includes(q)) return true;
      if (dateStr.includes(q)) return true;
      if (timeStr.includes(q)) return true;
      return false;
    });
  }, [instances, searchTerm]);

  const filteredIds = useMemo(() => filteredInstances.map((i) => i.id), [filteredInstances]);

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

  const openNew = () => {
    setSelectedInstance(null);
    setModalOpen(true);
  };

  const openEdit = (instance: InstanceWithLevelAndTemplate) => {
    setSelectedInstance(instance);
    setModalOpen(true);
  };

  const handleSave = async (payload: ClientClassInstance) => {
    if (selectedInstance) {
      await updateClassInstance(payload, selectedInstance.id);
    } else {
      await createClassInstance(payload);
    }
    router.refresh();
  };

  const handleDelete = async (instance: InstanceWithLevelAndTemplate) => {
    const label = instance.template?.name?.trim() || "Class";
    const ok = window.confirm(`Delete "${label}" on ${format(instance.startTime, "dd MMM yyyy, h:mm a")}?`);
    if (!ok) return;
    await deleteClassInstance(instance.id);
    router.refresh();
  };

  const deleteSelected = async () => {
    if (selectedFilteredIds.length === 0) return;
    const ok = window.confirm(`Delete ${selectedFilteredIds.length} selected class instances?`);
    if (!ok) return;

    for (const id of selectedFilteredIds) {
      await deleteClassInstance(id);
    }
    router.refresh();
    clearSelection();
  };

  return (
    <div className="w-full max-h-screen h-full">
      <ClassListHeader
        title="Classes"
        totalCount={instances.length}
        filteredCount={filteredInstances.length}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onNew={openNew}
        // selection controls
        allSelected={allFilteredSelected}
        someSelected={someFilteredSelected}
        selectedCount={selectedFilteredIds.length}
        onToggleAll={toggleAllFiltered}
        onClearSelection={clearSelection}
        onDeleteSelected={deleteSelected}
      />

      <ClassInstanceModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setSelectedInstance(null);
        }}
        instance={selectedInstance}
        levels={levels}
        onSave={handleSave}
      />

      <div className="max-h-[calc(100vh-]">
        {filteredInstances.map((i) => (
          <ClassListItem
            key={i.id}
            instance={i}
            checked={!!selectedIds[i.id]}
            onCheckedChange={(next) => toggleOne(i.id, next)}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        ))}

        {filteredInstances.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            No classes found{searchTerm.trim() ? ` for “${searchTerm.trim()}”` : ""}.
          </div>
        )}
      </div>
    </div>
  );
}

function ClassListHeader({
  title,
  totalCount,
  filteredCount,
  searchTerm,
  setSearchTerm,
  onNew,

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
  onNew: () => void;

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
              placeholder="Search classes…"
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
                  router.push("/admin/class/templates");
                }}
              >
                Templates
              </DropdownMenuItem>
            <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  router.push("/admin/schedule");
                }}
              >
                Schedule
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onNew();
                }}
              >
                New
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
            aria-label="Select all classes"
            className="h-4 w-4"
          />
        </div>

        <div className="truncate text-sm font-medium flex-1">Class</div>
        <div className="truncate text-sm font-medium flex-1">When</div>
        <div className="truncate text-sm font-medium flex-1">Level</div>
        <div className="truncate text-sm font-medium flex-1">Capacity</div>
        <div className="truncate text-sm font-medium w-[120px]">Status</div>

        {/* Vertical dots menu (kept) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open class actions"
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
    </>
  );
}

