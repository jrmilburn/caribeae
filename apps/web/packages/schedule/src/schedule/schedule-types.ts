// Core schedule domain types aligned to the shared Prisma schema
// (ClassInstance + related entities).

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
};

export type Enrolment = {
  id: string;
  student: { id: string; name: string };
  startDate?: string | null;
};

export type ClassInstance = {
  id: string;
  templateId?: string | null;
  startTime: Date;
  endTime: Date;
  status?: string | null;
  capacity?: number | null;
  level?: Level;
  levelId?: string;
  teacher?: Teacher | null;
  enrolments?: Enrolment[];
  location?: string | null;
};

export type NormalizedClassInstance = ClassInstance & {
  startTime: Date;
  endTime: Date;
  durationMin: number;
  dayName: DayOfWeek;
};

export function normalizeClassInstance(ci: ClassInstance): NormalizedClassInstance {
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
