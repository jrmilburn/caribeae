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
};

export type ScheduleClass = {
  /** Unique per-occurrence identifier (templateId + date). */
  id: string;
  templateId: string;
  templateName?: string | null;
  startTime: Date;
  endTime: Date;
  capacity?: number | null;
  level?: Level | null;
  levelId?: string | null;
  teacher?: Teacher | null;
};

export type NormalizedScheduleClass = ScheduleClass & {
  startTime: Date;
  endTime: Date;
  durationMin: number;
  dayName: DayOfWeek;
};

export function normalizeScheduleClass(ci: ScheduleClass): NormalizedScheduleClass {
  const start = ci.startTime instanceof Date ? ci.startTime : new Date(ci.startTime);
  const end = ci.endTime instanceof Date ? ci.endTime : new Date(ci.endTime);
  const durationMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60)));

  const dayName = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][start.getDay()] as DayOfWeek;

  return {
    ...ci,
    startTime: start,
    endTime: end,
    durationMin,
    dayName,
  };
}
