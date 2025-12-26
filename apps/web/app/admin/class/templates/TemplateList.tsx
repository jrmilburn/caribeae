"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useRouter } from "next/navigation";

import type { Prisma, Level, Teacher } from "@prisma/client";

import TemplateListItem from "./TemplateListItem";
import { TemplateModal } from "./TemplateModal";

import { createTemplate } from "@/server/classTemplate/createTemplate";
import { updateTemplate } from "@/server/classTemplate/updateTemplate";
import { deleteTemplate } from "@/server/classTemplate/deleteTemplate";

import type { ClientTemplate } from "@/server/classTemplate/types";

export type TemplateWithLevel = Prisma.ClassTemplateGetPayload<{
  include: { level: true; teacher: true };
}>;

export default function TemplateList({
  templates,
  levels,
  teachers,
}: {
  templates: TemplateWithLevel[];
  levels: Level[];
  teachers: Teacher[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [newTemplateModal, setNewTemplateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = React.useState<TemplateWithLevel | null>(null);

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
      />

      <TemplateModal
        open={newTemplateModal}
        onOpenChange={(open) => {
          setNewTemplateModal(open);
          if (!open) setSelectedTemplate(null);
        }}
        template={selectedTemplate}
        levels={levels}
        teachers={teachers}
        onSave={handleSave}
      />

      <div>
        {filteredTemplates.map((t) => (
          <TemplateListItem
            key={t.id}
            template={t}
            onEdit={openEdit}
            onDelete={handleDelete}
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
}: {
  title: string;
  totalCount: number;
  filteredCount: number;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  setNewTemplateModal: React.Dispatch<React.SetStateAction<boolean>>;
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
        <div className="truncate text-sm font-medium flex-1">Template</div>
        <div className="truncate text-sm font-medium flex-1">Schedule</div>
        <div className="truncate text-sm font-medium flex-1">Level</div>
        <div className="truncate text-sm font-medium flex-1">Capacity</div>
        <div className="w-12 text-sm font-medium text-muted-foreground text-right">Actions</div>
      </div>
    </>
  );
}

function formatDay(dayOfWeek?: number | null) {
  if (dayOfWeek === null || dayOfWeek === undefined) return null;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days[dayOfWeek] ?? null;
}
