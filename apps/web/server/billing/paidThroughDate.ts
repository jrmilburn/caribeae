import { addDays, isAfter } from "date-fns";

import type { HolidayRange } from "@/server/holiday/holidayUtils";
import {
  SCHEDULE_TIME_ZONE,
  normalizeToScheduleMidnight,
  scheduleDateKey,
  scheduleDayOfWeek,
} from "@/server/schedule/rangeUtils";

export type PaidThroughTemplate = {
  dayOfWeek: number | null;
  startTime?: number | null;
};

type PaidThroughOptions = {
  startDate: Date;
  endDate?: Date | null;
  creditsToCover: number;
  classTemplate: PaidThroughTemplate;
  holidays: HolidayRange[];
  cancellations?: Date[];
  timeZone?: string;
};

type PaidThroughResult = {
  paidThroughDate: Date | null;
  nextDueDate: Date | null;
  coveredOccurrences: number;
  remainingCredits: number;
};

function scheduleDateAtUtcMidnight(date: Date, timeZone: string): Date {
  const key = scheduleDateKey(date, timeZone);
  return new Date(`${key}T00:00:00.000Z`);
}

function buildSkippedDateSet(dates: Date[], timeZone: string) {
  return new Set(dates.map((date) => scheduleDateKey(date, timeZone)));
}

function buildHolidayDateSet(holidays: HolidayRange[], timeZone: string) {
  const set = new Set<string>();
  holidays.forEach((holiday) => {
    const start = scheduleDateAtUtcMidnight(holiday.startDate, timeZone);
    const end = scheduleDateAtUtcMidnight(holiday.endDate, timeZone);
    let cursor = start;
    while (cursor <= end) {
      set.add(scheduleDateKey(cursor, timeZone));
      cursor = addDays(cursor, 1);
    }
  });
  return set;
}

function nextScheduledOccurrence(
  cursor: Date,
  endDate: Date | null,
  skippedDates: Set<string>,
  timeZone: string
) {
  let next = cursor;
  while (!endDate || next <= endDate) {
    const key = scheduleDateKey(next, timeZone);
    if (!skippedDates.has(key)) return next;
    next = addDays(next, 7);
  }
  return null;
}

export function calculatePaidThroughDate(options: PaidThroughOptions): PaidThroughResult {
  const timeZone = options.timeZone ?? SCHEDULE_TIME_ZONE;
  const templateDay = options.classTemplate.dayOfWeek;
  if (templateDay === null || templateDay === undefined) {
    return {
      paidThroughDate: null,
      nextDueDate: null,
      coveredOccurrences: 0,
      remainingCredits: options.creditsToCover,
    };
  }

  const start = scheduleDateAtUtcMidnight(
    normalizeToScheduleMidnight(options.startDate, timeZone),
    timeZone
  );
  const end = options.endDate
    ? scheduleDateAtUtcMidnight(normalizeToScheduleMidnight(options.endDate, timeZone), timeZone)
    : null;

  if (end && isAfter(start, end)) {
    return {
      paidThroughDate: null,
      nextDueDate: null,
      coveredOccurrences: 0,
      remainingCredits: options.creditsToCover,
    };
  }

  const startDay = scheduleDayOfWeek(start, timeZone);
  const delta = (templateDay - startDay + 7) % 7;
  let cursor = addDays(start, delta);

  const holidayDates = buildHolidayDateSet(options.holidays, timeZone);
  const cancellationDates = buildSkippedDateSet(options.cancellations ?? [], timeZone);
  const skippedDates = new Set<string>([...holidayDates, ...cancellationDates]);

  const debugEnabled = process.env.DEBUG_PAID_THROUGH === "1";
  const debugEntries: string[] = [];

  if (options.creditsToCover <= 0) {
    const nextDue = nextScheduledOccurrence(cursor, end, skippedDates, timeZone);
    return {
      paidThroughDate: null,
      nextDueDate: nextDue,
      coveredOccurrences: 0,
      remainingCredits: 0,
    };
  }

  let remaining = options.creditsToCover;
  let paidThroughDate: Date | null = null;
  let covered = 0;

  while ((!end || cursor <= end) && remaining > 0) {
    const key = scheduleDateKey(cursor, timeZone);
    const skipped = skippedDates.has(key);
    if (debugEnabled && debugEntries.length < 8) {
      debugEntries.push(`${key}${skipped ? " (skipped)" : " (counted)"}`);
    }
    if (!skipped) {
      remaining -= 1;
      covered += 1;
      paidThroughDate = cursor;
    }
    cursor = addDays(cursor, 7);
  }

  if (debugEnabled && debugEntries.length > 0) {
    console.debug(
      `[paidThrough] credits=${options.creditsToCover} start=${scheduleDateKey(start, timeZone)} ` +
        `occurrences=${debugEntries.join(", ")}`
    );
  }

  const nextDue =
    paidThroughDate && remaining <= 0
      ? nextScheduledOccurrence(addDays(paidThroughDate, 7), end, skippedDates, timeZone)
      : nextScheduledOccurrence(cursor, end, skippedDates, timeZone);

  return {
    paidThroughDate,
    nextDueDate: nextDue,
    coveredOccurrences: covered,
    remainingCredits: remaining,
  };
}

export function listScheduledOccurrences(options: {
  startDate: Date;
  endDate: Date;
  classTemplate: PaidThroughTemplate;
  holidays: HolidayRange[];
  cancellations?: Date[];
  timeZone?: string;
}) {
  const timeZone = options.timeZone ?? SCHEDULE_TIME_ZONE;
  const templateDay = options.classTemplate.dayOfWeek;
  if (templateDay === null || templateDay === undefined) return [];

  const start = scheduleDateAtUtcMidnight(
    normalizeToScheduleMidnight(options.startDate, timeZone),
    timeZone
  );
  const end = scheduleDateAtUtcMidnight(
    normalizeToScheduleMidnight(options.endDate, timeZone),
    timeZone
  );

  if (isAfter(start, end)) return [];

  const startDay = scheduleDayOfWeek(start, timeZone);
  const delta = (templateDay - startDay + 7) % 7;
  let cursor = addDays(start, delta);

  const holidayDates = buildHolidayDateSet(options.holidays, timeZone);
  const cancellationDates = buildSkippedDateSet(options.cancellations ?? [], timeZone);
  const skippedDates = new Set<string>([...holidayDates, ...cancellationDates]);

  const occurrences: Date[] = [];
  while (cursor <= end) {
    const key = scheduleDateKey(cursor, timeZone);
    if (!skippedDates.has(key)) {
      occurrences.push(cursor);
    }
    cursor = addDays(cursor, 7);
  }
  return occurrences;
}
