"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Level, Teacher } from "@prisma/client";

import TemplateListItem from "./TemplateListItem";
import { TemplateModal } from "./TemplateModal";

import { createTemplate } from "@/server/classTemplate/createTemplate";
import { updateTemplate } from "@/server/classTemplate/updateTemplate";
import { deleteTemplate } from "@/server/classTemplate/deleteTemplate";
import { runMutationWithToast } from "@/lib/toast/mutationToast";

import type { ClientTemplate, TemplateModalTemplate } from "@/server/classTemplate/types";
import type { ClassTemplateListItem } from "@/server/classTemplate/listClassTemplates";

import { AdminListHeader } from "@/components/admin/AdminListHeader";
import { AdminPagination } from "@/components/admin/AdminPagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Fix:
 * Your list type (ClassTemplateListItem) is missing createdAt/updatedAt in its TS shape,
 * but your modal state expects TemplateModalTemplate which includes those fields.
 *
 * This type asserts that list items ALSO include createdAt/updatedAt, matching what the modal expects.
 * (If your DB query already returns them, this is purely a typing fix.)
 */
export type TemplateWithLevel = ClassTemplateListItem &
  Pick<TemplateModalTemplate, "createdAt" | "updatedAt">;

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [levelFilter, setLevelFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentLevelId = searchParams.get("levelId") ?? "all";
  const currentTeacherId = searchParams.get("teacherId") ?? "all";
  const currentStatus = searchParams.get("status") ?? "active";

  const hasActiveFilters = useMemo(
    () => currentLevelId !== "all" || currentTeacherId !== "all" || currentStatus !== "active",
    [currentLevelId, currentTeacherId, currentStatus]
  );

  useEffect(() => {
    setLevelFilter(currentLevelId);
    setTeacherFilter(currentTeacherId);
    setStatusFilter(currentStatus);
  }, [currentLevelId, currentTeacherId, currentStatus]);

  const openEdit = (template: TemplateWithLevel) => {
    setSelectedTemplate(template);
    setNewTemplateModal(true);
  };

  const handleSave = async (payload: ClientTemplate) => {
    if (selectedTemplate) {
      await runMutationWithToast(
        () => updateTemplate(payload, selectedTemplate.id),
        {
          pending: { title: "Saving class..." },
          success: { title: "Class updated" },
          error: (message) => ({
            title: "Unable to update class",
            description: message,
          }),
          onSuccess: () => router.refresh(),
          throwOnError: true,
        }
      );
    } else {
      await runMutationWithToast(
        () => createTemplate(payload),
        {
          pending: { title: "Creating class..." },
          success: { title: "Class created" },
          error: (message) => ({
            title: "Unable to create class",
            description: message,
          }),
          onSuccess: () => router.refresh(),
          throwOnError: true,
        }
      );
    }
  };

  const handleDelete = async (template: TemplateWithLevel) => {
    const ok = window.confirm(`Delete "${template.name ?? "Untitled template"}"?`);
    if (!ok) return;

    await runMutationWithToast(
      () => deleteTemplate(template.id),
      {
        pending: { title: "Deleting class..." },
        success: { title: "Class deleted" },
        error: (message) => ({
          title: "Unable to delete class",
          description: message,
        }),
        onSuccess: () => router.refresh(),
      }
    );
  };

  const applyFilters = () => {
    const params = new URLSearchParams(searchParams.toString());

    if (levelFilter && levelFilter !== "all") {
      params.set("levelId", levelFilter);
    } else {
      params.delete("levelId");
    }

    if (teacherFilter && teacherFilter !== "all") {
      params.set("teacherId", teacherFilter);
    } else {
      params.delete("teacherId");
    }

    if (statusFilter && statusFilter !== "active") {
      params.set("status", statusFilter);
    } else {
      params.delete("status");
    }

    params.delete("cursor");
    params.delete("cursors");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setLevelFilter("all");
    setTeacherFilter("all");
    setStatusFilter("active");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("levelId");
    params.delete("teacherId");
    params.delete("status");
    params.delete("cursor");
    params.delete("cursors");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    setFiltersOpen(false);
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
        onFiltersClick={() => setFiltersOpen(true)}
        sticky
      />

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filter templates</DialogTitle>
            <DialogDescription>Match templates by status, level, or teacher.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Status</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Active" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                  <SelectItem value="all">All templates</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Level</span>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {levels.map((level) => (
                    <SelectItem key={level.id} value={level.id}>
                      {level.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Teacher</span>
              <Select value={teacherFilter} onValueChange={setTeacherFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All teachers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teachers</SelectItem>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={clearFilters} disabled={!hasActiveFilters}>
              Clear filters
            </Button>
            <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setFiltersOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={applyFilters}>
                Apply filters
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <TemplateListItem key={t.id} template={t} onEdit={openEdit} onDelete={handleDelete} />
        ))}

        {templates.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">No templates found.</div>
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
