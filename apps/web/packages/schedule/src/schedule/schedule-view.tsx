"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, format, startOfWeek } from "date-fns";

import ScheduleGrid from "./schedule-grid";
import type { NormalizedScheduleClass } from "./schedule-types";
import { normalizeScheduleClass } from "./schedule-types";
import {
  createApiScheduleDataAdapter,
  type ScheduleDataAdapter,
} from "./schedule-data-adapter";
import type { Level } from "@prisma/client";

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
  onSlotClick?: (date: Date) => void;
  onClassClick?: (occurrence: NormalizedScheduleClass) => void;
  defaultViewMode?: "week" | "day";
  showHeader?: boolean;
  allowTemplateMoves?: boolean;

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
      showHeader = true,
      allowTemplateMoves = true,
      filters,
      headerActions,
      selectedTemplateIds,
      weekAnchor
    },
    ref
  ) {
    const [viewMode, setViewMode] = useState<"week" | "day">(defaultViewMode);
    const [currentWeek, setCurrentWeek] = useState<Date>(() =>
      normalizeWeekAnchor(weekAnchor ?? new Date())
    );
    const [selectedDay, setSelectedDay] = useState<number>(toMondayIndex(currentWeek));
    const [classes, setClasses] = useState<NormalizedScheduleClass[]>([]);
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
      if (!weekAnchor) return;
      const normalized = normalizeWeekAnchor(weekAnchor);
      setCurrentWeek(normalized);
      setSelectedDay(toMondayIndex(normalized));
    }, [weekAnchor]);

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


    const onMoveClass = React.useCallback(
      async (templateId: string, nextStart: Date) => {
        const existing = classes.find((c) => c.templateId === templateId);
        if (!existing) return;

        const duration = existing.durationMin;
        const nextEnd = addMinutes(nextStart, duration);

        const optimistic = normalizeScheduleClass({
          ...existing,
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

    return (
      <div className="flex h-full w-full min-h-0 flex-col">
        {showHeader && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentWeek(addDays(currentWeek, -7))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className=" bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">
                {format(weekStart, "MMM d")} – {format(displayWeekEnd, "MMM d, yyyy")}
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentWeek(addDays(currentWeek, 7))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

          <div className="flex items-center gap-2">
            {headerActions /* ✅ NEW slot */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentWeek(normalizeWeekAnchor(new Date()))}
            >
              Jump to current week
            </Button>
            {viewMode === "day" && (
              <Button variant="outline" size="sm" onClick={() => setViewMode("week")}>
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
            classes={filteredClasses}
            weekDates={weekDates}
            onSlotClick={onSlotClick}
            onClassClick={onClassClick}
            onMoveClass={allowTemplateMoves ? onMoveClass : undefined}
            viewMode={viewMode}
            setViewMode={setViewMode}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            levels={levels}
            selectedTemplateIds={selectedTemplateIds}
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
