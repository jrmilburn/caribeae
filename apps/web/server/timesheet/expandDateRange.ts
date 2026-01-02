import { addDays, startOfDay } from "date-fns";

export function expandRangeDates(from: Date, to: Date): Date[] {
  const start = startOfDay(from);
  const end = startOfDay(to);
  const days: Date[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}