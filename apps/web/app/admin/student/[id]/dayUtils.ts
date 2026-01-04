import type { NormalizedScheduleClass } from "@/packages/schedule";

export const SATURDAY_INDEX = 5;
export type SelectionDay = "saturday" | "weekday" | "mixed" | null;

export function dayOfWeekFromDate(date: Date) {
  const jsDay = date.getDay(); // 0 = Sunday
  return ((jsDay + 6) % 7) as number; // Normalize to Monday=0..Sunday=6
}

export function resolveTemplateDayOfWeek(occurrence: NormalizedScheduleClass): number | null {
  const fromTemplate = occurrence.template?.dayOfWeek;
  if (typeof fromTemplate === "number") return fromTemplate;
  const start = occurrence.startTime instanceof Date ? occurrence.startTime : new Date(occurrence.startTime);
  if (Number.isNaN(start.getTime())) return null;
  return dayOfWeekFromDate(start);
}

export function isSaturdayOccurrence(occurrence: NormalizedScheduleClass) {
  return resolveTemplateDayOfWeek(occurrence) === SATURDAY_INDEX;
}

export function resolveSelectionDay(templates: Record<string, NormalizedScheduleClass>): SelectionDay {
  const entries = Object.values(templates);
  if (!entries.length) return null;
  const hasSaturday = entries.some((entry) => isSaturdayOccurrence(entry));
  const hasWeekday = entries.some((entry) => !isSaturdayOccurrence(entry));
  if (hasSaturday && hasWeekday) return "mixed";
  return hasSaturday ? "saturday" : "weekday";
}
