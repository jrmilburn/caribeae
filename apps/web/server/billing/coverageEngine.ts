import { addDays } from "date-fns";

import type { HolidayRange } from "@/server/holiday/holidayUtils";
import {
  brisbaneAddDays,
  brisbaneCompare,
  brisbaneDayOfWeek,
  brisbaneStartOfDay,
  toBrisbaneDayKey,
  type BrisbaneDayKey,
} from "@/server/dates/brisbaneDay";

export type AssignedTemplateDay = {
  dayOfWeek: number | null | undefined;
};

function buildWeekdayCounts(templates: AssignedTemplateDay[]) {
  const counts = new Map<number, number>();
  templates.forEach((template) => {
    if (template.dayOfWeek == null) return;
    const normalized = ((template.dayOfWeek % 7) + 7) % 7;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  });
  return counts;
}

export function buildHolidayDayKeySet(holidays: HolidayRange[]): Set<BrisbaneDayKey> {
  const set = new Set<BrisbaneDayKey>();
  holidays.forEach((holiday) => {
    let cursor = toBrisbaneDayKey(holiday.startDate);
    const end = toBrisbaneDayKey(holiday.endDate);
    while (brisbaneCompare(cursor, end) <= 0) {
      set.add(cursor);
      cursor = brisbaneAddDays(cursor, 1);
    }
  });
  return set;
}

export function countScheduledSessions(params: {
  startDayKey: BrisbaneDayKey;
  endDayKey: BrisbaneDayKey;
  assignedTemplates: AssignedTemplateDay[];
}): number {
  if (brisbaneCompare(params.endDayKey, params.startDayKey) < 0) return 0;
  const weekdayCounts = buildWeekdayCounts(params.assignedTemplates);
  if (!weekdayCounts.size) return 0;

  let total = 0;
  let cursor = params.startDayKey;
  while (brisbaneCompare(cursor, params.endDayKey) <= 0) {
    const weekday = brisbaneDayOfWeek(cursor);
    const count = weekdayCounts.get(weekday) ?? 0;
    total += count;
    cursor = brisbaneAddDays(cursor, 1);
  }
  return total;
}

export function countScheduledSessionsExcludingHolidays(params: {
  startDayKey: BrisbaneDayKey;
  endDayKey: BrisbaneDayKey;
  assignedTemplates: AssignedTemplateDay[];
  holidays: HolidayRange[];
}): number {
  if (brisbaneCompare(params.endDayKey, params.startDayKey) < 0) return 0;
  const weekdayCounts = buildWeekdayCounts(params.assignedTemplates);
  if (!weekdayCounts.size) return 0;
  const holidaySet = buildHolidayDayKeySet(params.holidays);

  let total = 0;
  let cursor = params.startDayKey;
  while (brisbaneCompare(cursor, params.endDayKey) <= 0) {
    if (!holidaySet.has(cursor)) {
      const weekday = brisbaneDayOfWeek(cursor);
      const count = weekdayCounts.get(weekday) ?? 0;
      total += count;
    }
    cursor = brisbaneAddDays(cursor, 1);
  }
  return total;
}

export function nextScheduledDayKey(params: {
  startDayKey: BrisbaneDayKey;
  assignedTemplates: AssignedTemplateDay[];
  holidays?: HolidayRange[];
  endDayKey?: BrisbaneDayKey | null;
}): BrisbaneDayKey | null {
  const weekdayCounts = buildWeekdayCounts(params.assignedTemplates);
  if (!weekdayCounts.size) return null;
  const holidaySet = params.holidays ? buildHolidayDayKeySet(params.holidays) : new Set<BrisbaneDayKey>();

  let cursor = params.startDayKey;
  while (!params.endDayKey || brisbaneCompare(cursor, params.endDayKey) <= 0) {
    const weekday = brisbaneDayOfWeek(cursor);
    const count = weekdayCounts.get(weekday) ?? 0;
    if (count > 0 && !holidaySet.has(cursor)) return cursor;
    cursor = brisbaneAddDays(cursor, 1);
  }
  return null;
}

export function computeCoverageEndDay(params: {
  startDayKey: BrisbaneDayKey;
  assignedTemplates: AssignedTemplateDay[];
  holidays: HolidayRange[];
  entitlementSessions: number;
  endDayKey?: BrisbaneDayKey | null;
}): BrisbaneDayKey | null {
  if (params.entitlementSessions <= 0) return null;
  const weekdayCounts = buildWeekdayCounts(params.assignedTemplates);
  if (!weekdayCounts.size) return null;

  const holidaySet = buildHolidayDayKeySet(params.holidays);
  let remaining = params.entitlementSessions;
  let cursor = params.startDayKey;
  let lastCovered: BrisbaneDayKey | null = null;

  while (remaining > 0 && (!params.endDayKey || brisbaneCompare(cursor, params.endDayKey) <= 0)) {
    const weekday = brisbaneDayOfWeek(cursor);
    const count = weekdayCounts.get(weekday) ?? 0;
    if (count > 0 && !holidaySet.has(cursor)) {
      remaining -= count;
      lastCovered = cursor;
    }
    cursor = brisbaneAddDays(cursor, 1);
  }

  return lastCovered;
}

export function dayKeyToDate(dayKey: BrisbaneDayKey | null): Date | null {
  if (!dayKey) return null;
  return brisbaneStartOfDay(dayKey);
}

export function addDaysFromDayKey(dayKey: BrisbaneDayKey, amount: number): BrisbaneDayKey {
  return toBrisbaneDayKey(addDays(brisbaneStartOfDay(dayKey), amount));
}
