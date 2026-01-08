"use client";

import * as React from "react";
import { useRef, useState } from "react";
import type { ClassTemplate, Level, Teacher } from "@prisma/client";
import { SlidersHorizontal } from "lucide-react";

import { ScheduleView, type ScheduleViewHandle, type ScheduleFilters } from "@/packages/schedule";
import { TemplateModal } from "../class/templates/TemplateModal";
import { createTemplate } from "@/server/classTemplate/createTemplate";
import { updateTemplate } from "@/server/classTemplate/updateTemplate";
import type { ClientTemplate } from "@/server/classTemplate/types";
import type { NormalizedScheduleClass } from "@/packages/schedule";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * The schedule package often returns a "template DTO" that isn't the Prisma ClassTemplate type.
 * TemplateModal expects a full-ish record (id/createdAt/updatedAt/etc).
 *
 * This adapter converts the schedule template into a ClassTemplate shape.
 * If your schedule template already IS a ClassTemplate, this will still work.
 */
function coerceToClassTemplate(input: unknown): ClassTemplate {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid template payload");
  }

  const t = input as Partial<ClassTemplate> & Record<string, unknown>;

  // id is required to edit/update
  if (typeof t.id !== "string" || !t.id) {
    throw new Error("Template is missing id");
  }

  // createdAt/updatedAt are required by your TemplateModal prop type
  // If your API returns them as strings, convert them to Dates.
  const createdAt =
    t.createdAt instanceof Date
      ? t.createdAt
      : typeof t.createdAt === "string"
        ? new Date(t.createdAt)
        : new Date();

  const updatedAt =
    t.updatedAt instanceof Date
      ? t.updatedAt
      : typeof t.updatedAt === "string"
        ? new Date(t.updatedAt)
        : new Date();

  // Helper to allow nulls
  const asNumberOrNull = (v: unknown) => (typeof v === "number" ? v : null);
  const asStringOrNull = (v: unknown) => (typeof v === "string" ? v : null);

  // startDate is required by your error message; if missing, we set a sensible default.
  const startDate =
    t.startDate instanceof Date
      ? t.startDate
      : typeof t.startDate === "string"
        ? new Date(t.startDate)
        : new Date();

  const endDate =
    t.endDate instanceof Date
      ? t.endDate
      : typeof t.endDate === "string"
        ? new Date(t.endDate)
        : null;

  // levelId is required; if your schedule template doesn’t include it, that’s a backend/data issue.
  if (typeof t.levelId !== "string" || !t.levelId) {
    throw new Error("Template is missing levelId");
  }

  // active is required
  const active = typeof t.active === "boolean" ? t.active : true;

  return {
    id: t.id,
    name: (typeof t.name === "string" ? t.name : null) as ClassTemplate["name"],
    createdAt,
    updatedAt,
    teacherId: asStringOrNull(t.teacherId) as ClassTemplate["teacherId"],
    active,
    startDate,
    endDate,
    levelId: t.levelId,
    dayOfWeek: asNumberOrNull(t.dayOfWeek) as ClassTemplate["dayOfWeek"],
    startTime: asNumberOrNull(t.startTime) as ClassTemplate["startTime"],
    endTime: asNumberOrNull(t.endTime) as ClassTemplate["endTime"],
    capacity: asNumberOrNull(t.capacity) as ClassTemplate["capacity"],
  };
}

function FiltersPopover({
  levels,
  teachers,
  value,
  onApply,
}: {
  levels: Level[];
  teachers: Teacher[];
  value: ScheduleFilters;
  onApply: (next: ScheduleFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ScheduleFilters>(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  const activeCount = (value.levelId ? 1 : 0) + (value.teacherId ? 1 : 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 ? (
            <Badge variant="secondary" className="ml-1">
              {activeCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-3">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Teacher</div>
            <Select
              value={draft.teacherId ?? "all"}
              onValueChange={(v) => setDraft((p) => ({ ...p, teacherId: v === "all" ? null : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All teachers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teachers</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">Level</div>
            <Select
              value={draft.levelId ?? "all"}
              onValueChange={(v) => setDraft((p) => ({ ...p, levelId: v === "all" ? null : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                {levels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const cleared: ScheduleFilters = { teacherId: null, levelId: null };
                setDraft(cleared);
                onApply(cleared);
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onApply(draft);
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function ScheduleWithTemplateModal({
  levels,
  teachers,
}: {
  levels: Level[];
  teachers: Teacher[];
}) {
  const scheduleRef = useRef<ScheduleViewHandle>(null);

  const [filters, setFilters] = useState<ScheduleFilters>({ teacherId: null, levelId: null });

  const [modalOpen, setModalOpen] = useState(false);
  // ✅ must match TemplateModal prop expectation
  const [selectedTemplate, setSelectedTemplate] = useState<ClassTemplate | null>(null);

  const [prefill, setPrefill] = useState<{
    date: Date;
    startMinutes: number;
    levelId?: string;
    teacherId?: string;
    dayOfWeek?: number;
  } | null>(null);

  const handleSlotClick = (date: Date, _dayOfWeek: number) => {
    const minutes = date.getHours() * 60 + date.getMinutes();
    setSelectedTemplate(null);
    setPrefill({ date, startMinutes: minutes, dayOfWeek: _dayOfWeek });
    setModalOpen(true);
  };

  const handleClassClick = (occurrence: NormalizedScheduleClass) => {
    if (!occurrence.template) return;

    // ✅ convert schedule template -> ClassTemplate for TemplateModal + selectedTemplate.id usage
    try {
      setSelectedTemplate(coerceToClassTemplate(occurrence.template));
    } catch (e) {
      console.error(e);
      // If you want a toast here, add it.
      return;
    }

    const minutes = occurrence.startTime.getHours() * 60 + occurrence.startTime.getMinutes();

    setPrefill({
      date: occurrence.startTime,
      startMinutes: minutes,
      levelId: occurrence.levelId ?? undefined,
      teacherId: occurrence.teacherId ?? undefined,
    });

    setModalOpen(true);
  };

  const handleSave = async (payload: ClientTemplate) => {
    if (selectedTemplate) {
      // ✅ id exists because selectedTemplate is ClassTemplate
      await updateTemplate(payload, selectedTemplate.id);
    } else {
      await createTemplate(payload);
    }

    setModalOpen(false);
    setSelectedTemplate(null);
    scheduleRef.current?.softRefresh();
  };

  return (
    <>
      <ScheduleView
        ref={scheduleRef}
        levels={levels}
        dataEndpoint="/api/admin/class-templates"
        onSlotClick={handleSlotClick}
        onClassClick={handleClassClick}
        filters={filters}
        headerActions={<FiltersPopover levels={levels} teachers={teachers} value={filters} onApply={setFilters} />}
      />

      <TemplateModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setSelectedTemplate(null);
        }}
        template={selectedTemplate}
        levels={levels}
        teachers={teachers}
        onSave={handleSave}
        prefill={
          prefill
            ? {
                date: prefill.date,
                startMinutes: prefill.startMinutes,
                levelId: prefill.levelId,
                teacherId: prefill.teacherId,
              }
            : undefined
        }
      />
    </>
  );
}
