"use client";

import { useMemo, useState } from "react";
import { isSameDay } from "date-fns";

import type { DayOfWeek, NormalizedScheduleClass } from "./schedule-types";
import WeekView from "./week-view";
import DayView from "./day-view";

import type { Level } from "@prisma/client";

export type ScheduleGridProps = {
  loading: boolean;
  classes: NormalizedScheduleClass[];
  weekDates: Date[];
  onSlotClick?: (date: Date) => void;
  onClassClick?: (c: NormalizedScheduleClass) => void;
  onMoveClass?: (templateId: string, nextStart: Date) => Promise<void> | void;
  viewMode: "week" | "day";
  setViewMode: React.Dispatch<React.SetStateAction<"week" | "day">>;
  selectedDay: number;
  setSelectedDay: React.Dispatch<React.SetStateAction<number>>;
  levels: Level[];
};

const DAYS_OF_WEEK: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const TIME_SLOTS = generateTimeSlots();

export default function ScheduleGrid(props: ScheduleGridProps) {
  const {
    loading,
    classes,
    weekDates,
    onSlotClick,
    onClassClick,
    onMoveClass,
  viewMode,
  setViewMode,
  selectedDay,
  setSelectedDay,
  levels
  } = props;

  const levelLookup = useMemo(() => new Map(levels.map((l) => [l.id, l])), [levels]);
  const classesWithLevels = useMemo(
    () =>
      classes.map((c) =>
        c.level || !c.levelId ? c : { ...c, level: levelLookup.get(c.levelId) ?? c.level }
      ),
    [classes, levelLookup]
  );
  const normalized = useMemo(() => attachLayout(classesWithLevels), [classesWithLevels]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const selectedDayName = DAYS_OF_WEEK[selectedDay] ?? "Monday";

  if (loading) return <div>Loading</div>

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {viewMode === "week" ? (
        <WeekView
          DAYS_OF_WEEK={DAYS_OF_WEEK}
          TIME_SLOTS={TIME_SLOTS}
          weekDates={weekDates}
          classes={normalized}
          onDayHeaderClick={(day) => {
            const idx = dayToIndex(day);
            setSelectedDay(idx);
            setViewMode("day");
          }}
          onSlotClick={onSlotClick}
          onClassClick={onClassClick}
          onMoveClass={onMoveClass}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          getTeacherColor={getTeacherColor}
        />
      ) : (
        <DayView
          TIME_SLOTS={TIME_SLOTS}
          dayName={selectedDayName as DayOfWeek}
          dayDate={weekDates[dayToIndex(selectedDayName as DayOfWeek)] ?? weekDates[0]}
          classes={normalized.filter((c) => isSameDay(c.startTime, weekDates[dayToIndex(selectedDayName as DayOfWeek)] ?? new Date()))}
          onBack={() => setViewMode("week")}
          onSlotClick={onSlotClick}
          onClassClick={onClassClick}
          onMoveClass={onMoveClass}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          getTeacherColor={getTeacherColor}
        />
      )}
    </div>
  );
}

// ----- Helpers -----

type TimeSlot = { time24: string; time12: string; isHour: boolean };

function generateTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let hour = 5; hour <= 20; hour++) {
    for (let minute = 0; minute < 60; minute += 5) {
      const h = String(hour).padStart(2, "0");
      const m = String(minute).padStart(2, "0");
      const time24 = `${h}:${m}`;
      const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const ampm = hour >= 12 ? "PM" : "AM";
      const time12 = `${hour12}:${m} ${ampm}`;
      slots.push({ time24, time12, isHour: minute === 0 });
    }
  }
  return slots;
}

function dayToIndex(day: DayOfWeek): number {
  const ordered: DayOfWeek[] = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  return ordered.indexOf(day);
}

type LayoutInfo = { column: number; columns: number };

function attachLayout(instances: NormalizedScheduleClass[]): Array<NormalizedScheduleClass & LayoutInfo> {
  const byDay = new Map<DayOfWeek, NormalizedScheduleClass[]>();
  for (const inst of instances) {
    if (!byDay.has(inst.dayName)) byDay.set(inst.dayName, []);
    byDay.get(inst.dayName)!.push(inst);
  }

  const layoutMap = new Map<string, LayoutInfo>();

  byDay.forEach((dayInstances) => {
    const events = dayInstances
      .map((c) => {
        const start = c.startTime.getHours() * 60 + c.startTime.getMinutes();
        return { id: c.id, start, end: start + c.durationMin };
      })
      .sort((a, b) => a.start - b.start);

    let active: typeof events = [];

    for (const event of events) {
      active = active.filter((e) => e.end > event.start);

      const usedCols = active.map((e) => layoutMap.get(e.id)!.column);
      let col = 0;
      while (usedCols.includes(col)) col++;

      active.push(event);
      const columns = Math.max(active.length, col + 1);

      for (const e of active) {
        const existing = layoutMap.get(e.id);
        layoutMap.set(e.id, { column: existing?.column ?? col, columns });
      }
    }
  });

  return instances.map((inst) => ({
    ...inst,
    column: layoutMap.get(inst.id)?.column ?? 0,
    columns: layoutMap.get(inst.id)?.columns ?? 1,
  }));
}

function getTeacherColor(teacherId?: string | null) {
  const colors = [
    { bg: "bg-purple-100 dark:bg-purple-900", border: "border-purple-300 dark:border-purple-700", text: "text-purple-700 dark:text-purple-300" },
    { bg: "bg-green-100 dark:bg-green-900", border: "border-green-300 dark:border-green-700", text: "text-green-700 dark:text-green-300" },
    { bg: "bg-orange-100 dark:bg-orange-900", border: "border-orange-300 dark:border-orange-700", text: "text-orange-700 dark:text-orange-300" },
    { bg: "bg-blue-100 dark:bg-blue-900", border: "border-blue-300 dark:border-blue-700", text: "text-blue-700 dark:text-blue-300" },
  ] as const;

  if (!teacherId) return colors[0];
  const idx = Math.abs(hashString(teacherId)) % colors.length;
  return colors[idx];
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
