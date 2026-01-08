"use client";

import { useMemo, useState } from "react";

import type { DayOfWeek, NormalizedScheduleClass } from "./schedule-types";
import { dayOfWeekToName } from "./schedule-types";
import WeekView from "./week-view";
import DayView from "./day-view";

import ScheduleGridSkeleton from "./Loading";

import type { Level } from "@prisma/client";

export type ScheduleGridProps = {
  loading: boolean;
  classes: NormalizedScheduleClass[];
  weekDates: Date[];
  onSlotClick?: (date: Date) => void;
  onClassClick?: (c: NormalizedScheduleClass) => void;
  onMoveClass?: (templateId: string, nextStart: Date, dayOfWeek: number) => Promise<void> | void;
  viewMode: "week" | "day";
  setViewMode: React.Dispatch<React.SetStateAction<"week" | "day">>;
  selectedDay: number;
  setSelectedDay: React.Dispatch<React.SetStateAction<number>>;
  levels: Level[];
  selectedTemplateIds?: string[];
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
  levels,
  selectedTemplateIds,
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

  const selectedDayName = dayOfWeekToName(selectedDay);

  if (loading) return <ScheduleGridSkeleton days={DAYS_OF_WEEK} />

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">

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
          selectedTemplateIds={selectedTemplateIds}
        />
      ) : (
        <DayView
          TIME_SLOTS={TIME_SLOTS}
          dayName={selectedDayName as DayOfWeek}
          dayDate={weekDates[dayToIndex(selectedDayName as DayOfWeek)] ?? weekDates[0]}
          dayOfWeek={selectedDay}
          classes={normalized.filter((c) => c.dayOfWeek === selectedDay)}
          onSlotClick={onSlotClick}
          onClassClick={onClassClick}
          onMoveClass={onMoveClass}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          getTeacherColor={getTeacherColor}
          selectedTemplateIds={selectedTemplateIds}
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

type LayoutInfo = {
  laneIndex: number;
  laneCount: number;
  laneOffset: number;
  laneColumns: number;
};

function attachLayout(instances: NormalizedScheduleClass[]): Array<NormalizedScheduleClass & LayoutInfo> {
  const { laneByTeacherId, laneCount, unassignedLane } = buildTeacherLanes(instances);
  const byDay = new Map<number, NormalizedScheduleClass[]>();
  for (const inst of instances) {
    if (!byDay.has(inst.dayOfWeek)) byDay.set(inst.dayOfWeek, []);
    byDay.get(inst.dayOfWeek)!.push(inst);
  }

  const layoutMap = new Map<string, { laneOffset: number; laneColumns: number }>();

  byDay.forEach((dayInstances) => {
    const byTeacher = new Map<string | null, NormalizedScheduleClass[]>();
    for (const inst of dayInstances) {
      const teacherKey = inst.teacherId ?? inst.teacher?.id ?? null;
      if (!byTeacher.has(teacherKey)) byTeacher.set(teacherKey, []);
      byTeacher.get(teacherKey)!.push(inst);
    }

    byTeacher.forEach((teacherInstances) => {
      const events = teacherInstances
        .map((c) => {
          const start = c.startTime.getHours() * 60 + c.startTime.getMinutes();
          return { id: c.id, start, end: start + c.durationMin };
        })
        .sort((a, b) => a.start - b.start);

      let active: typeof events = [];

      for (const event of events) {
        active = active.filter((e) => e.end > event.start);

        const usedOffsets = active.map((e) => layoutMap.get(e.id)?.laneOffset ?? 0);
        let laneOffset = 0;
        while (usedOffsets.includes(laneOffset)) laneOffset++;

        active.push(event);

        const laneColumns =
          Math.max(
            laneOffset,
            ...active.map((e) => layoutMap.get(e.id)?.laneOffset ?? 0)
          ) + 1;

        for (const e of active) {
          const existing = layoutMap.get(e.id);
          layoutMap.set(e.id, {
            laneOffset: existing?.laneOffset ?? laneOffset,
            laneColumns: Math.max(existing?.laneColumns ?? 1, laneColumns),
          });
        }
      }
    });
  });

  return instances.map((inst) => {
    const teacherKey = inst.teacherId ?? inst.teacher?.id ?? null;
    const laneIndex =
      teacherKey ? laneByTeacherId.get(teacherKey) ?? unassignedLane ?? 0 : unassignedLane ?? 0;
    const layout = layoutMap.get(inst.id);
    return {
      ...inst,
      laneIndex,
      laneCount,
      laneOffset: layout?.laneOffset ?? 0,
      laneColumns: layout?.laneColumns ?? 1,
    };
  });
}

function buildTeacherLanes(instances: NormalizedScheduleClass[]) {
  const teacherEntries = new Map<string, string>();
  let hasUnassigned = false;

  for (const inst of instances) {
    const teacherId = inst.teacherId ?? inst.teacher?.id ?? null;
    if (!teacherId) {
      hasUnassigned = true;
      continue;
    }
    if (!teacherEntries.has(teacherId)) {
      teacherEntries.set(teacherId, inst.teacher?.name ?? teacherId);
    }
  }

  const orderedTeachers = Array.from(teacherEntries.entries()).sort((a, b) => {
    const nameCompare = a[1].localeCompare(b[1], undefined, { sensitivity: "base" });
    if (nameCompare !== 0) return nameCompare;
    return a[0].localeCompare(b[0]);
  });

  const laneByTeacherId = new Map<string, number>();
  orderedTeachers.forEach(([teacherId], index) => {
    laneByTeacherId.set(teacherId, index);
  });

  const unassignedLane = hasUnassigned ? orderedTeachers.length : null;
  const laneCount = orderedTeachers.length + (hasUnassigned ? 1 : 0);

  return { laneByTeacherId, laneCount: Math.max(laneCount, 1), unassignedLane };
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
