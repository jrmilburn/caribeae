// Core schedule domain types aligned to the shared Prisma schema
// (ClassTemplate + derived occurrences).

export type DayOfWeek =
  | "Sunday"
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday";

export type Teacher = {
  id: string;
  name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type Level = {
  id: string;
  name: string;
  levelOrder?: number | null;
  defaultCapacity?: number | null;
  defaultLengthMin?: number | null;
};

export type ClassTemplate = {
  id: string;
  name?: string | null;
  dayOfWeek?: number | null; // 0-6 (Mon-Sun)
  startTime?: number | null; // minutes since midnight
  endTime?: number | null; // minutes since midnight
  startDate: Date | string;
  endDate?: Date | string | null;
  capacity?: number | null;
  active?: boolean | null;
  level?: Level | null;
  levelId?: string;
  teacher?: Teacher | null;
  teacherId?: string | null;
};

export type ScheduleClass = {
  /** Unique per-occurrence identifier (templateId + date). */
  id: string;
  templateId: string;
  templateName?: string | null;
  dayOfWeek: number; // 0-6 (Mon-Sun)
  startTime: Date;
  endTime: Date;
  capacity?: number | null;
  level?: Level | null;
  levelId?: string | null;
  teacher?: Teacher | null;
  teacherId?: string | null;
  template?: ClassTemplate | null;
  cancelled?: boolean;
  cancellationReason?: string | null;
};

export type Holiday = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  note?: string | null;
  levelId?: string | null;
  templateId?: string | null;
};

export type NormalizedScheduleClass = ScheduleClass & {
  startTime: Date;
  endTime: Date;
  durationMin: number;
  dayName: DayOfWeek;
};

export type ScheduleClassClickContext = {
  columnDate: Date;
  columnDateKey: string;
  columnIndex: number;
};

export const DAY_OF_WEEK_NAMES: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const DAY_OF_WEEK_SHORT_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function dayOfWeekToName(dayOfWeek: number): DayOfWeek {
  return DAY_OF_WEEK_NAMES[dayOfWeek] ?? "Monday";
}

export function dayOfWeekToShortLabel(dayOfWeek: number): string {
  return DAY_OF_WEEK_SHORT_LABELS[dayOfWeek] ?? "Mon";
}

export function normalizeScheduleClass(ci: ScheduleClass): NormalizedScheduleClass {
  const start = ci.startTime instanceof Date ? ci.startTime : new Date(ci.startTime);
  const end = ci.endTime instanceof Date ? ci.endTime : new Date(ci.endTime);
  const durationMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60)));

  const dayOfWeek = ci.dayOfWeek ?? ci.template?.dayOfWeek ?? 0;
  const dayName = dayOfWeekToName(dayOfWeek);

  return {
    ...ci,
    dayOfWeek,
    startTime: start,
    endTime: end,
    durationMin,
    dayName,
  };
}
