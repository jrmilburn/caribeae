"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Search, X, MoreVerticalIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useRouter } from "next/navigation";

import type { Prisma, Level } from "@prisma/client";

import TemplateListItem from "./TemplateListItem";
import { TemplateModal } from "./TemplateModal";
import { GenerateInstancesModal } from "./GenerateInstancesModal";

import { createTemplate } from "@/server/classTemplate/createTemplate";
import { updateTemplate } from "@/server/classTemplate/updateTemplate";
import { deleteTemplate } from "@/server/classTemplate/deleteTemplate";

import type { ClientTemplate } from "@/server/classTemplate/types";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export type TemplateWithLevel = Prisma.ClassTemplateGetPayload<{
  include: { level: true };
}>;

export default function TemplateList({
  templates,
  levels,
}: {
  templates: TemplateWithLevel[];
  levels: Level[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [newTemplateModal, setNewTemplateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = React.useState<TemplateWithLevel | null>(null);

  // selection
  const [selectedIds, setSelectedIds] = React.useState<Record<string, boolean>>({});

  // generator modal state
  const [genOpen, setGenOpen] = React.useState(false);
  const [genTemplateIds, setGenTemplateIds] = React.useState<string[]>([]);
  const [genLabel, setGenLabel] = React.useState<string>("");

  const router = useRouter();

  const filteredTemplates = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return templates;

    return templates.filter((t) => {
      const name = t.name?.toLowerCase() ?? "";
      const level = t.level?.name?.toLowerCase() ?? "";
      const day = formatDay(t.dayOfWeek)?.toLowerCase() ?? "";

      if (name.includes(q)) return true;
      if (level.includes(q)) return true;
      if (day.includes(q)) return true;
      return false;
    });
  }, [templates, searchTerm]);

  // derived selection for current filtered list
  const filteredIds = useMemo(() => filteredTemplates.map((t) => t.id), [filteredTemplates]);

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

  const openEdit = (template: TemplateWithLevel) => {
    setSelectedTemplate(template);
    setNewTemplateModal(true);
  };

  const handleSave = async (payload: ClientTemplate) => {
    if (selectedTemplate) {
      const update = await updateTemplate(payload, selectedTemplate.id);
      router.refresh();
      return update;
    } else {
      const created = await createTemplate(payload);
      router.refresh();
      return created;
    }
  };

  const handleDelete = async (template: TemplateWithLevel) => {
    const ok = window.confirm(`Delete "${template.name ?? "Untitled template"}"?`);
    if (!ok) return;

    await deleteTemplate(template.id);
    router.refresh();
  };

  const openGenerateForOne = (template: TemplateWithLevel) => {
    setGenTemplateIds([template.id]);
    setGenLabel(template.name?.trim() || "Untitled");
    setGenOpen(true);
  };

  const openGenerateForSelected = () => {
    if (selectedFilteredIds.length === 0) return;

    setGenTemplateIds(selectedFilteredIds);
    setGenLabel(`${selectedFilteredIds.length} templates`);
    setGenOpen(true);
  };

  return (
    <div className="w-full">
      <TemplateListHeader
        title="Templates"
        totalCount={templates.length}
        filteredCount={filteredTemplates.length}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        setNewTemplateModal={(next) => {
          if (next) setSelectedTemplate(null);
          setNewTemplateModal(next);
        }}
        // selection controls
        allSelected={allFilteredSelected}
        someSelected={someFilteredSelected}
        selectedCount={selectedFilteredIds.length}
        onToggleAll={(next) => toggleAllFiltered(next)}
        onGenerateSelected={openGenerateForSelected}
        onClearSelection={clearSelection}
      />

      <TemplateModal
        open={newTemplateModal}
        onOpenChange={(open) => {
          setNewTemplateModal(open);
          if (!open) setSelectedTemplate(null);
        }}
        template={selectedTemplate}
        levels={levels}
        onSave={handleSave}
      />

      <GenerateInstancesModal
        open={genOpen}
        onOpenChange={setGenOpen}
        templateIds={genTemplateIds}
        label={genLabel}
        onSuccess={() => {
          router.refresh();
          // keep selection (handy) OR clear selection (safer). MVP preference: keep.
          // clearSelection();
        }}
      />

      <div>
        {filteredTemplates.map((t) => (
          <TemplateListItem
            key={t.id}
            template={t}
            checked={!!selectedIds[t.id]}
            onCheckedChange={(next) => toggleOne(t.id, next)}
            onEdit={openEdit}
            onDelete={handleDelete}
            onGenerate={openGenerateForOne}
          />
        ))}

        {filteredTemplates.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            No templates found{searchTerm.trim() ? ` for “${searchTerm.trim()}”` : ""}.
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateListHeader({
  title,
  totalCount,
  filteredCount,
  searchTerm,
  setSearchTerm,
  setNewTemplateModal,

  allSelected,
  someSelected,
  selectedCount,
  onToggleAll,
  onGenerateSelected,
  onClearSelection,
}: {
  title: string;
  totalCount: number;
  filteredCount: number;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  setNewTemplateModal: React.Dispatch<React.SetStateAction<boolean>>;

  allSelected: boolean;
  someSelected: boolean;
  selectedCount: number;
  onToggleAll: (next: boolean) => void;
  onGenerateSelected: () => void;
  onClearSelection: () => void;
}) {
  const hasQuery = searchTerm.trim().length > 0;

  return (
    <>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">{title}</h2>
            <span className="text-xs text-muted-foreground">
              {hasQuery ? `${filteredCount} / ${totalCount}` : totalCount}
            </span>
            {selectedCount > 0 ? (
              <span className="text-xs text-muted-foreground">
                • {selectedCount} selected
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative w-full sm:w-[340px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchTerm("");
            }}
            placeholder="Search templates…"
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

        <Button onClick={() => setNewTemplateModal(true)}>New</Button>
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
            aria-label="Select all templates"
            className="h-4 w-4"
          />
        </div>

        <div className="truncate text-sm font-medium flex-1">Template</div>
        <div className="truncate text-sm font-medium flex-1">Schedule</div>
        <div className="truncate text-sm font-medium flex-1">Level</div>
        <div className="truncate text-sm font-medium flex-1">Capacity</div>

        {/* header actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open template actions"
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
              onSelect={() => {
                onGenerateSelected();
              }}
            >
              Generate for selected
            </DropdownMenuItem>

            <DropdownMenuItem
              disabled={selectedCount === 0}
              onSelect={() => {
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

function formatDay(dayOfWeek?: number | null) {
  if (dayOfWeek === null || dayOfWeek === undefined) return null;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days[dayOfWeek] ?? null;
}
