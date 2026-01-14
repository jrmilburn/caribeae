"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import type { Level, Teacher } from "@prisma/client";

import TemplateListItem from "./TemplateListItem";
import { TemplateModal } from "./TemplateModal";

import { createTemplate } from "@/server/classTemplate/createTemplate";
import { updateTemplate } from "@/server/classTemplate/updateTemplate";
import { deleteTemplate } from "@/server/classTemplate/deleteTemplate";

import type { ClientTemplate, TemplateModalTemplate } from "@/server/classTemplate/types";
import type { ClassTemplateListItem } from "@/server/classTemplate/listClassTemplates";

import { AdminListHeader } from "@/components/admin/AdminListHeader";
import { AdminPagination } from "@/components/admin/AdminPagination";

export type TemplateWithLevel = ClassTemplateListItem;

export default function TemplateList({
  templates,
  levels,
  teachers,
  totalCount,
  nextCursor,
  pageSize,
}: {
  templates: TemplateWithLevel[];
  levels: Level[];
  teachers: Teacher[];
  totalCount: number;
  nextCursor: string | null;
  pageSize: number;
}) {
  const [newTemplateModal, setNewTemplateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateModalTemplate | null>(null);

  const router = useRouter();

  const openEdit = (template: TemplateWithLevel) => {
    setSelectedTemplate(template);
    setNewTemplateModal(true);
  };

  const handleSave = async (payload: ClientTemplate) => {
    if (selectedTemplate) {
      await updateTemplate(payload, selectedTemplate.id);
      router.refresh();
    } else {
      await createTemplate(payload);
      router.refresh();
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
      <AdminListHeader
        title="Templates"
        totalCount={totalCount}
        searchPlaceholder="Search templates…"
        onNew={() => {
          setSelectedTemplate(null);
          setNewTemplateModal(true);
        }}
        showFilters
        sticky
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
        <div className="flex h-14 w-full items-center justify-between border-t border-b border-border bg-card px-4 text-sm font-medium text-muted-foreground">
          <div className="truncate flex-[1.2]">Template</div>
          <div className="truncate flex-1">Schedule</div>
          <div className="truncate flex-1">Level</div>
          <div className="truncate flex-1">Capacity</div>
          <div className="w-12 text-right">Actions</div>
        </div>

        {templates.map((t) => (
          <TemplateListItem
            key={t.id}
            template={t}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        ))}

        {templates.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            No templates found.
          </div>
        )}
      </div>

      <AdminPagination
        totalCount={totalCount}
        pageSize={pageSize}
        currentCount={templates.length}
        nextCursor={nextCursor}
      />
    </div>
  );
}
