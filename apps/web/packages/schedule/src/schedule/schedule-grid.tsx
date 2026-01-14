"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import type {
  DayOfWeek,
  Holiday,
  NormalizedScheduleClass,
  ScheduleClassClickContext,
} from "./schedule-types";
import { dayOfWeekToName } from "./schedule-types";
import WeekView from "./week-view";
import DayView from "./day-view";

import ScheduleGridSkeleton from "./Loading";
import { dayOfWeekToColumnIndex } from "./schedule-date-utils";

import type { Level } from "@prisma/client";

export type ScheduleGridProps = {
  loading: boolean;
  classes: NormalizedScheduleClass[];
  weekDates: Date[];
  holidays: Map<string, Holiday[]>;
  onSlotClick?: (date: Date, dayOfWeek: number) => void;
  onClassClick?: (c: NormalizedScheduleClass, context?: ScheduleClassClickContext) => void;
  onMoveClass?: (templateId: string, nextStart: Date, dayOfWeek: number) => Promise<void> | void;
  viewMode: "week" | "day";
  setViewMode: React.Dispatch<React.SetStateAction<"week" | "day">>;
  selectedDay: number;
  setSelectedDay: React.Dispatch<React.SetStateAction<number>>;
  levels: Level[];
  selectedTemplateIds?: string[];
  showHeaderDates?: boolean;
  showDayDate?: boolean;
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
    holidays,
    onSlotClick,
    onClassClick,
    onMoveClass,
    viewMode,
    setViewMode,
    selectedDay,
    setSelectedDay,
    levels,
    selectedTemplateIds,
    showHeaderDates = true,
    showDayDate = true,
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
  const teacherColorMap = useMemo(() => createTeacherColorMap(classesWithLevels), [classesWithLevels]);
  const getTeacherColor = useMemo(
    () => (teacherId?: string | null) => teacherColorMap.get(teacherId ?? "") ?? DEFAULT_TEACHER_COLOR,
    [teacherColorMap]
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const selectedDayName = dayOfWeekToName(selectedDay);

  if (loading) return <ScheduleGridSkeleton days={DAYS_OF_WEEK} />;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {viewMode === "week" ? (
        <WeekView
          DAYS_OF_WEEK={DAYS_OF_WEEK}
          TIME_SLOTS={TIME_SLOTS}
          weekDates={weekDates}
          classes={normalized}
          holidays={holidays}
          showHeaderDates={showHeaderDates}
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
          classes={normalized.filter((c) => dayOfWeekToColumnIndex(c.dayOfWeek) === selectedDay)}
          holidays={holidays}
          showHeaderDates={showDayDate}
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
  const { orderedTeacherIds } = buildTeacherLanes(instances);
  const byDay = new Map<number, NormalizedScheduleClass[]>();
  for (const inst of instances) {
    const dayIndex = dayOfWeekToColumnIndex(inst.dayOfWeek);
    if (!byDay.has(dayIndex)) byDay.set(dayIndex, []);
    byDay.get(dayIndex)!.push(inst);
  }

  const layoutMap = new Map<string, { laneOffset: number; laneColumns: number }>();
  const laneMetaByDay = new Map<
    number,
    { laneByTeacherId: Map<string, number>; laneCount: number; unassignedLane: number | null }
  >();

  byDay.forEach((dayInstances, dayIndex) => {
    const { laneByTeacherId, laneCount, unassignedLane } = buildDayLanes(
      dayInstances,
      orderedTeacherIds
    );
    laneMetaByDay.set(dayIndex, {
      laneByTeacherId,
      laneCount,
      unassignedLane,
    });

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
    const dayMeta = laneMetaByDay.get(dayOfWeekToColumnIndex(inst.dayOfWeek));
    const laneByTeacherId = dayMeta?.laneByTeacherId;
    const laneCount = dayMeta?.laneCount ?? 1;
    const unassignedLane = dayMeta?.unassignedLane ?? null;
    const laneIndex =
      teacherKey
        ? laneByTeacherId?.get(teacherKey) ?? unassignedLane ?? 0
        : unassignedLane ?? 0;
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

  for (const inst of instances) {
    const teacherId = inst.teacherId ?? inst.teacher?.id ?? null;
    if (!teacherId) continue;
    if (!teacherEntries.has(teacherId)) {
      teacherEntries.set(teacherId, inst.teacher?.name ?? teacherId);
    }
  }

  const orderedTeachers = Array.from(teacherEntries.entries()).sort((a, b) => {
    const nameCompare = a[1].localeCompare(b[1], undefined, { sensitivity: "base" });
    if (nameCompare !== 0) return nameCompare;
    return a[0].localeCompare(b[0]);
  });

  return { orderedTeacherIds: orderedTeachers.map(([teacherId]) => teacherId) };
}

function buildDayLanes(dayInstances: NormalizedScheduleClass[], orderedTeacherIds: string[]) {
  const teachersToday = new Set<string>();
  let hasUnassigned = false;

  for (const inst of dayInstances) {
    const teacherId = inst.teacherId ?? inst.teacher?.id ?? null;
    if (!teacherId) {
      hasUnassigned = true;
      continue;
    }
    teachersToday.add(teacherId);
  }

  const orderedToday = orderedTeacherIds.filter((teacherId) => teachersToday.has(teacherId));
  const laneByTeacherId = new Map<string, number>();
  orderedToday.forEach((teacherId, index) => {
    laneByTeacherId.set(teacherId, index);
  });

  const unassignedLane = hasUnassigned ? orderedToday.length : null;
  const laneCount = orderedToday.length + (hasUnassigned ? 1 : 0);

  return { laneByTeacherId, laneCount: Math.max(laneCount, 1), unassignedLane };
}

type TeacherColor = {
  bg: string;
  border: string;
  text: string;
  style?: CSSProperties;
};

const DEFAULT_TEACHER_COLOR: TeacherColor = {
  bg: "bg-muted/40",
  border: "border-muted-foreground/30",
  text: "text-muted-foreground",
};

const TEACHER_COLOR_CLASSES = {
  bg: "bg-[hsl(var(--schedule-hue)_70%_92%)] dark:bg-[hsl(var(--schedule-hue)_40%_22%)]",
  border: "border-[hsl(var(--schedule-hue)_60%_80%)] dark:border-[hsl(var(--schedule-hue)_35%_40%)]",
  text: "text-[hsl(var(--schedule-hue)_45%_30%)] dark:text-[hsl(var(--schedule-hue)_65%_70%)]",
} as const;

function createTeacherColorMap(instances: NormalizedScheduleClass[]) {
  const map = new Map<string, TeacherColor>();
  for (const inst of instances) {
    const teacherId = inst.teacherId ?? inst.teacher?.id ?? null;
    if (!teacherId || map.has(teacherId)) continue;
    map.set(teacherId, buildTeacherColor(teacherId));
  }
  return map;
}

function buildTeacherColor(teacherId: string): TeacherColor {
  const hue = Math.abs(hashString(teacherId)) % 360;
  return {
    ...TEACHER_COLOR_CLASSES,
    style: { ["--schedule-hue" as string]: hue } as CSSProperties,
  };
}

// Deterministic 32-bit hash (FNV-1a)
export function hashString(input: string): number {
  let hash = 0x811c9dc5; // 2166136261

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619 (but using bit ops for 32-bit overflow behavior)
    hash = Math.imul(hash, 0x01000193);
  }

  // Convert to signed 32-bit int
  return hash | 0;
}
