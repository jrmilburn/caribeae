import { addDays } from "date-fns";

import {
  brisbaneAddDays,
  brisbaneCompare,
  brisbaneDayOfWeek,
  brisbaneStartOfDay,
  toBrisbaneDayKey,
} from "@/server/dates/brisbaneDay";

export type HolidayRange = {
  startDate: Date;
  endDate: Date;
  levelId?: string | null;
  templateId?: string | null;
};

export function buildHolidayDateSet(holidays: HolidayRange[]): Set<string> {
  const set = new Set<string>();
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

export function holidayAppliesToTemplate(
  holiday: HolidayRange,
  template: { id: string; levelId?: string | null }
): boolean {
  if (holiday.templateId) {
    return holiday.templateId === template.id;
  }
  if (holiday.levelId) {
    return holiday.levelId === (template.levelId ?? null);
  }
  return true;
}

export function holidayRangeIncludesDayKey(holiday: HolidayRange, dayKey: string): boolean {
  const start = toBrisbaneDayKey(holiday.startDate);
  const end = toBrisbaneDayKey(holiday.endDate);
  return brisbaneCompare(start, dayKey) <= 0 && brisbaneCompare(dayKey, end) <= 0;
}

export function countHolidayOccurrences(params: {
  startDate: Date;
  endDate: Date;
  templateDayOfWeek: number;
  holidays: HolidayRange[];
}): number {
  const start = brisbaneStartOfDay(params.startDate);
  const end = brisbaneStartOfDay(params.endDate);
  if (end < start) return 0;

  const holidayDates = buildHolidayDateSet(params.holidays);
  if (holidayDates.size === 0) return 0;

  const startDay = brisbaneDayOfWeek(start);
  const delta = (params.templateDayOfWeek - startDay + 7) % 7;
  let cursor = addDays(start, delta);

  let count = 0;
  while (cursor <= end) {
    if (holidayDates.has(toBrisbaneDayKey(cursor))) {
      count += 1;
    }
    cursor = addDays(cursor, 7);
  }

  return count;
}
