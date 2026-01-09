import { addDays, format, isValid, parseISO, startOfDay } from "date-fns";

export function normalizeToLocalMidnight(value: Date | string): Date {
  const date = value instanceof Date ? value : parseISO(value);
  if (!isValid(date)) {
    throw new Error("Invalid date");
  }
  return startOfDay(date);
}

export function enumerateDatesInclusive(start: Date | string, end: Date | string): Date[] {
  const startDate = normalizeToLocalMidnight(start);
  const endDate = normalizeToLocalMidnight(end);
  if (endDate < startDate) return [];

  const dates: Date[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function dateKey(value: Date | string): string {
  return format(normalizeToLocalMidnight(value), "yyyy-MM-dd");
}

export function toTemplateDayOfWeek(date: Date): number {
  return (date.getDay() + 6) % 7;
}
