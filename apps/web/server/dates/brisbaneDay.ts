import { addDays } from "date-fns";

import {
  SCHEDULE_TIME_ZONE,
  normalizeToScheduleMidnight,
  scheduleDateKey,
  scheduleDayOfWeek,
} from "@/server/schedule/rangeUtils";

export const BRISBANE_TIME_ZONE = SCHEDULE_TIME_ZONE;

export type BrisbaneDayKey = string;

export function toBrisbaneDayKey(value: Date | string): BrisbaneDayKey {
  const date = normalizeToScheduleMidnight(value, BRISBANE_TIME_ZONE);
  return scheduleDateKey(date, BRISBANE_TIME_ZONE);
}

export function brisbaneStartOfDay(value: Date | string): Date {
  return normalizeToScheduleMidnight(value, BRISBANE_TIME_ZONE);
}

export function fromBrisbaneDayKey(dayKey: BrisbaneDayKey): Date {
  return brisbaneStartOfDay(dayKey);
}

export function addDaysUtc(date: Date, amount: number): Date {
  const base = brisbaneStartOfDay(date);
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

export function brisbaneAddDays(dayKey: BrisbaneDayKey, amount: number): BrisbaneDayKey {
  const start = brisbaneStartOfDay(dayKey);
  return toBrisbaneDayKey(addDays(start, amount));
}

export function brisbaneCompare(a: BrisbaneDayKey, b: BrisbaneDayKey): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function isSameBrisbaneDay(a: Date | string, b: Date | string): boolean {
  return toBrisbaneDayKey(a) === toBrisbaneDayKey(b);
}

export function brisbaneDayOfWeek(value: Date | string): number {
  const date = brisbaneStartOfDay(value);
  return scheduleDayOfWeek(date, BRISBANE_TIME_ZONE);
}
