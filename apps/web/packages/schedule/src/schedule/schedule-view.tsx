"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, format, startOfWeek } from "date-fns";

import ScheduleGrid from "./schedule-grid";
import type {
  Holiday,
  NormalizedScheduleClass,
  ScheduleClassClickContext,
} from "./schedule-types";
import { normalizeScheduleClass } from "./schedule-types";
import {
  createApiScheduleDataAdapter,
  type ScheduleDataAdapter,
} from "./schedule-data-adapter";
import type { Level } from "@prisma/client";
import {
  enumerateScheduleDatesInclusive,
  normalizeToScheduleMidnight,
  scheduleDateKey,
} from "./schedule-date-utils";

export type ScheduleViewHandle = {
  /** Re-fetches schedule data without flipping `loading` (prevents UI “reload” / unmount). */
  softRefresh: () => void;
};

export type ScheduleFilters = {
  levelId?: string | null;
  teacherId?: string | null;
};

export type ScheduleViewProps = {
  levels: Level[];
  dataAdapter?: ScheduleDataAdapter;
  dataEndpoint?: string;
  onSlotClick?: (date: Date, dayOfWeek: number) => void;
  onClassClick?: (occurrence: NormalizedScheduleClass, context?: ScheduleClassClickContext) => void;
  defaultViewMode?: "week" | "day";
  viewMode?: "week" | "day";
  showHeader?: boolean;
  allowTemplateMoves?: boolean;
  mode?: "default" | "enrolmentChange";
  selectedDate?: Date;
  onViewModeChange?: (mode: "week" | "day") => void;
  onSelectedDateChange?: (date: Date) => void;

  // ✅ NEW
  filters?: ScheduleFilters;
  headerActions?: React.ReactNode;
  selectedTemplateIds?: string[];
  weekAnchor?: Date;
};


export const ScheduleView = React.forwardRef<ScheduleViewHandle, ScheduleViewProps>(
  function ScheduleView(
    {
      levels,
      dataAdapter,
      dataEndpoint = "/api/admin/class-templates",
      onSlotClick,
      onClassClick,
      defaultViewMode = "week",
      viewMode: controlledViewMode,
      showHeader = true,
      allowTemplateMoves = true,
      mode = "default",
      selectedDate,
      onViewModeChange,
      onSelectedDateChange,
      filters,
      headerActions,
      selectedTemplateIds,
      weekAnchor
    },
    ref
  ) {
    const initialAnchor = normalizeWeekAnchor(selectedDate ?? weekAnchor ?? new Date());
    const [viewMode, setViewMode] = useState<"week" | "day">(controlledViewMode ?? defaultViewMode);
    const [currentWeek, setCurrentWeek] = useState<Date>(() => initialAnchor);
    const [selectedDay, setSelectedDay] = useState<number>(() =>
      toMondayIndex(selectedDate ?? initialAnchor)
    );
    const [classes, setClasses] = useState<NormalizedScheduleClass[]>([]);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    const [error, setError] = useState<string | null>(null);

    const adapter = React.useMemo(
      () => dataAdapter ?? createApiScheduleDataAdapter(dataEndpoint),
      [dataAdapter, dataEndpoint]
    );

  const weekStart = useMemo(
    () => startOfWeek(currentWeek, { weekStartsOn: 1 }),
    [currentWeek]
  );
  const displayWeekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const levelFilter = filters?.levelId ?? null;
  const teacherFilter = filters?.teacherId ?? null;

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

    React.useEffect(() => {
      if (!selectedDate) return;
      const normalized = normalizeWeekAnchor(selectedDate);
      setCurrentWeek(normalized);
      setSelectedDay(toMondayIndex(selectedDate));
    }, [selectedDate]);

    React.useEffect(() => {
      if (selectedDate || !weekAnchor) return;
      const normalized = normalizeWeekAnchor(weekAnchor);
      setCurrentWeek(normalized);
      setSelectedDay(toMondayIndex(normalized));
    }, [selectedDate, weekAnchor]);

    React.useEffect(() => {
      if (!controlledViewMode) return;
      setViewMode(controlledViewMode);
    }, [controlledViewMode]);

    React.useEffect(() => {
      if (!onSelectedDateChange) return;
      const nextDate = addDays(weekStart, selectedDay);
      onSelectedDateChange(nextDate);
    }, [onSelectedDateChange, selectedDay, weekStart]);

    const handleViewModeChange = React.useCallback(
      (next: React.SetStateAction<"week" | "day">) => {
        setViewMode((prev) => {
          const resolved = typeof next === "function" ? next(prev) : next;
          if (resolved !== prev) {
            onViewModeChange?.(resolved);
          }
          return resolved;
        });
      },
      [onViewModeChange]
    );

    const handleWeekChange = React.useCallback((nextDate: Date) => {
      setCurrentWeek(normalizeWeekAnchor(nextDate));
    }, []);

    // Initial / week-navigation load (shows loading state)
    React.useEffect(() => {
      let cancelled = false;
      async function loadClasses() {
        setLoading(true);
        setError(null);
        try {
          const data = await adapter.fetchClasses({
            from: weekStart,
            to: displayWeekEnd,
            levelId: levelFilter ?? undefined,
          });
          if (cancelled) return;
          setClasses(data.map(normalizeScheduleClass));
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Unable to load schedule");
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      void loadClasses();
      return () => {
        cancelled = true;
      };
    }, [adapter, weekStart, displayWeekEnd, levelFilter]);

    React.useEffect(() => {
      let cancelled = false;
      async function loadHolidays() {
        try {
          const params = new URLSearchParams({
            from: scheduleDateKey(weekStart),
            to: scheduleDateKey(displayWeekEnd),
          });
          const response = await fetch(`/api/admin/holidays?${params.toString()}`, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          });
          if (!response.ok) {
            throw new Error("Unable to load holidays");
          }
          const payload = (await response.json()) as { holidays?: Holiday[] };
          const normalized = Array.isArray(payload.holidays)
            ? payload.holidays.map((holiday) => ({
                ...holiday,
                startDate: normalizeToScheduleMidnight(holiday.startDate),
                endDate: normalizeToScheduleMidnight(holiday.endDate),
              }))
            : [];
          if (!cancelled) {
            setHolidays(normalized);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Unable to load holidays");
          }
        }
      }
      void loadHolidays();
      return () => {
        cancelled = true;
      };
    }, [weekStart, displayWeekEnd]);

    // Background refresh (does NOT flip `loading`, so the grid stays mounted)
    const softRefresh = React.useCallback(() => {
      void (async () => {
        try {
          const data = await adapter.fetchClasses({
            from: weekStart,
            to: displayWeekEnd,
            levelId: levelFilter ?? undefined,
          });
          setClasses(data.map(normalizeScheduleClass));
        } catch (err) {
          // Keep it non-blocking; you can remove this if you don't want the banner.
          setError(err instanceof Error ? err.message : "Unable to refresh schedule");
        }
      })();
    }, [adapter, weekStart, displayWeekEnd, levelFilter]);

    React.useImperativeHandle(ref, () => ({ softRefresh }), [softRefresh]);

    const filteredClasses = useMemo(() => {
      const levelId = levelFilter;
      const teacherId = teacherFilter;

      if (!levelId && !teacherId) return classes;

      return classes.filter((c) => {
        if (levelId && c.levelId !== levelId) return false;
        if (teacherId && c.teacherId !== teacherId) return false;
        return true;
      });
    }, [classes, levelFilter, teacherFilter]);

    const holidayIndex = useMemo(() => {
      const index = new Map<string, Holiday[]>();
      holidays.forEach((holiday) => {
        enumerateScheduleDatesInclusive(holiday.startDate, holiday.endDate).forEach((date) => {
          const key = scheduleDateKey(date);
          const existing = index.get(key) ?? [];
          existing.push(holiday);
          index.set(key, existing);
        });
      });
      return index;
    }, [holidays]);

    const visibleClasses = useMemo(
      () =>
        filteredClasses.filter(
          (occurrence) => !holidayIndex.has(scheduleDateKey(occurrence.startTime))
        ),
      [filteredClasses, holidayIndex]
    );


    const onMoveClass = React.useCallback(
      async (templateId: string, nextStart: Date, dayOfWeek: number) => {
        const existing = classes.find((c) => c.templateId === templateId);
        if (!existing) return;

        const duration = existing.durationMin;
        const nextEnd = addMinutes(nextStart, duration);

        const optimistic = normalizeScheduleClass({
          ...existing,
          dayOfWeek,
          startTime: nextStart,
          endTime: nextEnd,
        });

        // optimistic UI update
        setClasses((prev) =>
          prev.map((c) => (c.templateId === templateId ? optimistic : c))
        );

        if (!adapter.moveTemplate) return;

        try {
          await adapter.moveTemplate({
            templateId,
            startTime: nextStart,
            endTime: nextEnd,
          });

          // ✅ reconcile with server in the background without unmounting the grid
          softRefresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unable to move class");
          setClasses((prev) =>
            prev.map((c) => (c.templateId === templateId ? existing : c))
          );
        }
      },
      [adapter, classes, softRefresh]
    );

    const isEnrolmentChange = mode === "enrolmentChange";
    const showScheduleHeader = showHeader && !isEnrolmentChange;

    return (
      <div className="flex h-full w-full min-h-0 flex-col">
        {showScheduleHeader && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleWeekChange(addDays(currentWeek, -7))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className=" bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">
                {format(weekStart, "MMM d")} – {format(displayWeekEnd, "MMM d, yyyy")}
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={() => handleWeekChange(addDays(currentWeek, 7))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

          <div className="flex items-center gap-2">
            {headerActions /* ✅ NEW slot */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleWeekChange(new Date())}
            >
              Jump to current week
            </Button>
            {viewMode === "day" && (
              <Button variant="outline" size="sm" onClick={() => handleViewModeChange("week")}>
                Back to week
              </Button>
            )}
          </div>
          </div>
        )}

        {error && (
          <div className=" border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-hidden border-t border-border bg-card shadow-sm">
          <ScheduleGrid
            loading={loading}
            classes={visibleClasses}
            weekDates={weekDates}
            holidays={holidayIndex}
            onSlotClick={onSlotClick}
            onClassClick={onClassClick}
            onMoveClass={allowTemplateMoves ? onMoveClass : undefined}
            viewMode={viewMode}
            setViewMode={handleViewModeChange}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            levels={levels}
            selectedTemplateIds={selectedTemplateIds}
            showHeaderDates={!isEnrolmentChange}
            showDayDate={!isEnrolmentChange}
          />
        </div>
      </div>
    );
  }
);

function normalizeWeekAnchor(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);
  return normalized;
}

function toMondayIndex(date: Date): number {
  const js = date.getDay(); // 0=Sun
  return js === 0 ? 6 : js - 1; // Monday=0
}

function addMinutes(date: Date, minutes: number): Date {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() + minutes);
  return copy;
}
