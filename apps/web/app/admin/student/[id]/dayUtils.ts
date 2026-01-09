import { dayOfWeekToName, SCHEDULE_TIME_ZONE, type NormalizedScheduleClass } from "@/packages/schedule";

export const SATURDAY_INDEX = 5;
export type SelectionDay = "saturday" | "weekday" | "mixed" | null;

export function dayOfWeekFromScheduleDate(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: SCHEDULE_TIME_ZONE,
    weekday: "short",
  });
  const day = formatter.format(date);
  const lookup: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return lookup[day] ?? 0;
}

export function resolveTemplateDayOfWeek(occurrence: NormalizedScheduleClass): number | null {
  if (typeof occurrence.dayOfWeek === "number") return occurrence.dayOfWeek;
  const fromTemplate = occurrence.template?.dayOfWeek;
  if (typeof fromTemplate === "number") return fromTemplate;
  return null;
}

export function isSaturdayOccurrence(occurrence: NormalizedScheduleClass) {
  return resolveTemplateDayOfWeek(occurrence) === SATURDAY_INDEX;
}

export function resolveTemplateDayName(occurrence: NormalizedScheduleClass) {
  const dayOfWeek = resolveTemplateDayOfWeek(occurrence);
  return typeof dayOfWeek === "number" ? dayOfWeekToName(dayOfWeek) : null;
}

export function resolveSelectionDay(templates: Record<string, NormalizedScheduleClass>): SelectionDay {
  const entries = Object.values(templates);
  if (!entries.length) return null;
  const hasSaturday = entries.some((entry) => isSaturdayOccurrence(entry));
  const hasWeekday = entries.some((entry) => !isSaturdayOccurrence(entry));
  if (hasSaturday && hasWeekday) return "mixed";
  return hasSaturday ? "saturday" : "weekday";
}
