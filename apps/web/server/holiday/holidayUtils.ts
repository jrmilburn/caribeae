import { addDays } from "date-fns";

import {
  enumerateScheduleDatesInclusive,
  normalizeToScheduleMidnight,
  scheduleDateKey,
  scheduleDayOfWeek,
} from "@/server/schedule/rangeUtils";

export type HolidayRange = {
  startDate: Date;
  endDate: Date;
};

export function buildHolidayDateSet(holidays: HolidayRange[]): Set<string> {
  const set = new Set<string>();
  holidays.forEach((holiday) => {
    enumerateScheduleDatesInclusive(holiday.startDate, holiday.endDate).forEach((date) => {
      set.add(scheduleDateKey(date));
    });
  });
  return set;
}

export function countHolidayOccurrences(params: {
  startDate: Date;
  endDate: Date;
  templateDayOfWeek: number;
  holidays: HolidayRange[];
}): number {
  const start = normalizeToScheduleMidnight(params.startDate);
  const end = normalizeToScheduleMidnight(params.endDate);
  if (end < start) return 0;

  const holidayDates = buildHolidayDateSet(params.holidays);
  if (holidayDates.size === 0) return 0;

  const startDay = scheduleDayOfWeek(start);
  const delta = (params.templateDayOfWeek - startDay + 7) % 7;
  let cursor = addDays(start, delta);

  let count = 0;
  while (cursor <= end) {
    if (holidayDates.has(scheduleDateKey(cursor))) {
      count += 1;
    }
    cursor = addDays(cursor, 7);
  }

  return count;
}
