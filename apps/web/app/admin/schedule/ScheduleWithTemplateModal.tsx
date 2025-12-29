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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    // keep draft in sync if filters change externally
    setDraft(value);
  }, [value]);

  const activeCount = (value.levelId ? 1 : 0) + (value.teacherId ? 1 : 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {activeCount}
            </Badge>
          )}
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
                const cleared = { teacherId: null, levelId: null };
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

  const [filters, setFilters] = useState<ScheduleFilters>({
    teacherId: null,
    levelId: null,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ClassTemplate | null>(null);
  const [prefill, setPrefill] = useState<{
    date: Date;
    startMinutes: number;
    levelId?: string;
    teacherId?: string;
  } | null>(null);

  const handleSlotClick = (date: Date) => {
    const minutes = date.getHours() * 60 + date.getMinutes();
    setSelectedTemplate(null);
    setPrefill({ date, startMinutes: minutes });
    setModalOpen(true);
  };

  const handleClassClick = (occurrence: NormalizedScheduleClass) => {
    if (!occurrence.template) return;

    setSelectedTemplate(occurrence.template);

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
        headerActions={
          <FiltersPopover
            levels={levels}
            teachers={teachers}
            value={filters}
            onApply={setFilters}
          />
        }
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
