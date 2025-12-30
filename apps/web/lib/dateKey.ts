import { format, isValid, parseISO, startOfDay } from "date-fns";

export const DATE_KEY_FORMAT = "yyyy-MM-dd";

export function formatDateKey(date: Date): string {
  return format(startOfDay(date), DATE_KEY_FORMAT);
}

export function parseDateKey(dateKey: string | null | undefined): Date | null {
  if (!dateKey) return null;
  const parsed = parseISO(dateKey);
  if (!isValid(parsed)) return null;
  return startOfDay(parsed);
}

export function isSameDateKey(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  return parseDateKey(a)?.getTime() === parseDateKey(b)?.getTime();
}
