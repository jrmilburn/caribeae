import { addDays } from "date-fns";

import {
  dateKey,
  enumerateDatesInclusive,
  normalizeToLocalMidnight,
  toTemplateDayOfWeek,
} from "@/lib/dateUtils";

export type HolidayRange = {
  startDate: Date;
  endDate: Date;
};

export function buildHolidayDateSet(holidays: HolidayRange[]): Set<string> {
  const set = new Set<string>();
  holidays.forEach((holiday) => {
    enumerateDatesInclusive(holiday.startDate, holiday.endDate).forEach((date) => {
      set.add(dateKey(date));
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
  const start = normalizeToLocalMidnight(params.startDate);
  const end = normalizeToLocalMidnight(params.endDate);
  if (end < start) return 0;

  const holidayDates = buildHolidayDateSet(params.holidays);
  if (holidayDates.size === 0) return 0;

  const startDay = toTemplateDayOfWeek(start);
  const delta = (params.templateDayOfWeek - startDay + 7) % 7;
  let cursor = addDays(start, delta);

  let count = 0;
  while (cursor <= end) {
    if (holidayDates.has(dateKey(cursor))) {
      count += 1;
    }
    cursor = addDays(cursor, 7);
  }

  return count;
}
