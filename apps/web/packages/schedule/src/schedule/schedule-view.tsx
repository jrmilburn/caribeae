"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, format, startOfWeek } from "date-fns";

import ScheduleGrid from "./schedule-grid";
import type { NormalizedClassInstance, ClassInstance } from "./schedule-types";
import { normalizeClassInstance } from "./schedule-types";
import {
  createApiScheduleDataAdapter,
  type ScheduleDataAdapter,
} from "./schedule-data-adapter";
import type { Level } from "@prisma/client";

export type ScheduleViewProps = {
  /** Required adapter for real projects; defaults to a demo adapter for local usage. */
  levels: Level[];
  dataAdapter?: ScheduleDataAdapter;
  /** Optional endpoint used to build a client-safe adapter without passing functions from server components. */
  dataEndpoint?: string;
  defaultViewMode?: "week" | "day";
  showHeader?: boolean;
};

export function ScheduleView({
  levels,
  dataAdapter,
  dataEndpoint = "/api/admin/class-instances",
  defaultViewMode = "week",
  showHeader = true,
}: ScheduleViewProps) {
  const [viewMode, setViewMode] = useState<"week" | "day">(defaultViewMode);
  const [currentWeek, setCurrentWeek] = useState<Date>(() =>
    normalizeWeekAnchor(new Date())
  );
  const [selectedDay, setSelectedDay] = useState<number>(toMondayIndex(currentWeek));
  const [instances, setInstances] = useState<NormalizedClassInstance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [error, setError] = useState<string | null>(null);

  const adapter = React.useMemo(
    () => dataAdapter ?? createApiScheduleDataAdapter(dataEndpoint),
    [dataAdapter, dataEndpoint]
  );

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const displayWeekEnd = addDays(weekStart, 6);

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadInstances() {
      setLoading(true);
      setError(null);
      try {
        const data = await adapter.fetchClassInstances({
          from: weekStart,
          to: displayWeekEnd,
        });
        if (cancelled) return;
        setInstances(data.map(normalizeClassInstance));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to load schedule");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInstances();
    return () => {
      cancelled = true;
    };
  }, [adapter, weekStart, displayWeekEnd]);

  const onMoveInstance = React.useCallback(
    async (id: string, nextStart: Date) => {
      const existing = instances.find((c) => c.id === id);
      if (!existing) return;

      const duration = existing.durationMin;
      const nextEnd = addMinutes(nextStart, duration);

      const optimistic: NormalizedClassInstance = normalizeClassInstance({
        ...existing,
        startTime: nextStart,
        endTime: nextEnd,
      } as ClassInstance);

      setInstances((prev) => prev.map((c) => (c.id === id ? optimistic : c)));

      if (!adapter.moveClassInstance) return;

      try {
        const persisted = await adapter.moveClassInstance({
          id,
          startTime: nextStart,
          endTime: nextEnd,
        });

        setInstances((prev) =>
          prev.map((c) => (c.id === id ? normalizeClassInstance(persisted) : c))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to move class");
        // revert
        setInstances((prev) => prev.map((c) => (c.id === id ? existing : c)));
      }
    },
    [instances, adapter]
  );

  return (
    <div className="flex h-full w-full flex-col">
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
          classInstances={instances}
          weekDates={weekDates}
          onMoveInstance={onMoveInstance}
          viewMode={viewMode}
          setViewMode={setViewMode}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          levels={levels}
        />
      </div>
    </div>
  );
}

function normalizeWeekAnchor(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);
  return normalized;
}

function addMinutes(date: Date, minutes: number): Date {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() + minutes);
  return copy;
}

function toMondayIndex(date: Date): number {
  const js = date.getDay(); // 0=Sun
  return js === 0 ? 6 : js - 1; // Monday=0
}
