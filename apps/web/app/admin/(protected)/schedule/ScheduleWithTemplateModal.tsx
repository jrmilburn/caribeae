"use client";

import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Level, Teacher } from "@prisma/client";
import { SlidersHorizontal } from "lucide-react";

import {
  ScheduleView,
  scheduleDateFromKey,
  scheduleDateKey,
  type ScheduleViewHandle,
  type ScheduleFilters,
  type ScheduleClassClickContext,
} from "@/packages/schedule";
import { CreateClassSheet } from "./CreateClassSheet";
import { createTemplate } from "@/server/classTemplate/createTemplate";
import type { ClientTemplate } from "@/server/classTemplate/types";
import type { NormalizedScheduleClass } from "@/packages/schedule";
import { runMutationWithToast } from "@/lib/toast/mutationToast";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSyncedQueryState } from "@/hooks/useSyncedQueryState";
import { buildReturnUrl } from "@/lib/returnContext";

function getScheduleDescription(date?: Date | null) {
  if (!date) return undefined;
  return `Scheduled for ${date.toLocaleDateString()}`;
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
  const router = useRouter();
  const scheduleRef = useRef<ScheduleViewHandle>(null);

  const defaultDateKey = useMemo(() => scheduleDateKey(new Date()), []);
  const [viewMode, setViewMode] = useSyncedQueryState<"week" | "day">("view", {
    defaultValue: "week",
    parse: (value) => (value === "day" ? "day" : "week"),
    serialize: (value) => value,
  });
  const [selectedDateKey, setSelectedDateKey] = useSyncedQueryState<string>("date", {
    defaultValue: defaultDateKey,
    parse: (value) => value ?? defaultDateKey,
    serialize: (value) => value,
  });
  const [levelId, setLevelId] = useSyncedQueryState<string | null>("levelId", {
    defaultValue: null,
    parse: (value) => value ?? null,
    serialize: (value) => value ?? null,
  });
  const [teacherId, setTeacherId] = useSyncedQueryState<string | null>("teacherId", {
    defaultValue: null,
    parse: (value) => value ?? null,
    serialize: (value) => value ?? null,
  });
  const [makeupOnly, setMakeupOnly] = useSyncedQueryState<boolean>("makeupOnly", {
    defaultValue: false,
    parse: (value) => value === "1",
    serialize: (value) => (value ? "1" : null),
  });
  const selectedDate = useMemo(() => {
    try {
      return scheduleDateFromKey(selectedDateKey);
    } catch {
      return scheduleDateFromKey(defaultDateKey);
    }
  }, [defaultDateKey, selectedDateKey]);

  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  const [prefill, setPrefill] = useState<{
    date: Date;
    startMinutes: number;
    levelId?: string;
    teacherId?: string;
    dayOfWeek?: number;
  } | null>(null);

  const handleSlotClick = (date: Date, _dayOfWeek: number) => {
    const minutes = date.getHours() * 60 + date.getMinutes();
    setPrefill({ date, startMinutes: minutes, dayOfWeek: _dayOfWeek });
    setCreateSheetOpen(true);
  };

  const scheduleStateUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("view", viewMode);
    params.set("date", selectedDateKey);
    if (levelId) params.set("levelId", levelId);
    if (teacherId) params.set("teacherId", teacherId);
    if (makeupOnly) params.set("makeupOnly", "1");
    const qs = params.toString();
    return qs ? `/admin/schedule?${qs}` : "/admin/schedule";
  }, [levelId, makeupOnly, selectedDateKey, teacherId, viewMode]);
  const scheduleStateKey = useMemo(() => `admin-schedule:${scheduleStateUrl}`, [scheduleStateUrl]);

  const handleClassClick = (occurrence: NormalizedScheduleClass, context?: ScheduleClassClickContext) => {
    const dateKey = context?.columnDateKey ?? scheduleDateKey(context?.columnDate ?? occurrence.startTime);
    const params = new URLSearchParams({ date: dateKey });
    const target = `/admin/class/${occurrence.templateId}?${params.toString()}`;
    router.push(buildReturnUrl(target, scheduleStateUrl));
  };

  const handleSave = async (payload: ClientTemplate) => {
    const description = getScheduleDescription(
      payload.startDate instanceof Date ? payload.startDate : prefill?.date ?? null
    );

    await runMutationWithToast(
      () => createTemplate(payload),
      {
        pending: { title: "Creating class..." },
        success: { title: "Class created", description },
        error: (message) => ({
          title: "Unable to create class",
          description: message,
        }),
        throwOnError: true,
      }
    );

    setCreateSheetOpen(false);
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
        viewMode={viewMode}
        selectedDate={selectedDate}
        persistKey={scheduleStateKey}
        scrollKey={scheduleStateKey}
        onViewModeChange={(next) => {
          if (next === viewMode) return;
          setViewMode(next);
        }}
        onSelectedDateChange={(nextDate) => {
          const nextKey = scheduleDateKey(nextDate);
          if (nextKey === selectedDateKey) return;
          setSelectedDateKey(nextKey);
        }}
        filters={{ teacherId, levelId, makeupOnly } satisfies ScheduleFilters}
        headerActions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={makeupOnly ? "default" : "outline"}
              onClick={() => setMakeupOnly(!makeupOnly)}
            >
              {makeupOnly ? "Showing makeup spots" : "Show makeup spots"}
            </Button>
            <FiltersPopover
              levels={levels}
              teachers={teachers}
              value={{ teacherId, levelId } satisfies ScheduleFilters}
              onApply={(next) => {
                setTeacherId(next.teacherId ?? null);
                setLevelId(next.levelId ?? null);
              }}
            />
          </div>
        }
      />

      <CreateClassSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        levels={levels}
        teachers={teachers}
        onSave={handleSave}
        prefill={
          prefill
            ? {
                date: prefill.date,
                startMinutes: prefill.startMinutes,
                dayOfWeek: prefill.dayOfWeek,
                levelId: prefill.levelId,
                teacherId: prefill.teacherId,
              }
            : undefined
        }
      />
    </>
  );
}
