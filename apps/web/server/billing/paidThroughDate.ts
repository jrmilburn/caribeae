import { addDays, isAfter } from "date-fns";

import type { HolidayRange } from "@/server/holiday/holidayUtils";
import {
  brisbaneDayOfWeek,
  brisbaneStartOfDay,
  toBrisbaneDayKey,
} from "@/server/dates/brisbaneDay";
import { computeCoverageEndDay, dayKeyToDate, nextScheduledDayKey } from "@/server/billing/coverageEngine";

export type PaidThroughTemplate = {
  dayOfWeek: number | null;
  startTime?: number | null;
};

export type BlockCoverageResult = {
  coverageStart: Date | null;
  coverageEnd: Date | null;
  coverageEndBase: Date | null;
  creditsPurchased: number;
};

type PaidThroughOptions = {
  startDate: Date;
  endDate?: Date | null;
  creditsToCover: number;
  classTemplate: PaidThroughTemplate;
  holidays: HolidayRange[];
  cancellations?: Date[];
};

type PaidThroughResult = {
  paidThroughDate: Date | null;
  nextDueDate: Date | null;
  coveredOccurrences: number;
  remainingCredits: number;
};

function scheduleDateAtUtcMidnight(date: Date): Date {
  const key = toBrisbaneDayKey(date);
  return brisbaneStartOfDay(key);
}

function buildSkippedDateSet(dates: Date[]) {
  return new Set(dates.map((date) => toBrisbaneDayKey(date)));
}

function buildHolidayDateSet(holidays: HolidayRange[]) {
  const set = new Set<string>();
  holidays.forEach((holiday) => {
    const start = scheduleDateAtUtcMidnight(holiday.startDate);
    const end = scheduleDateAtUtcMidnight(holiday.endDate);
    let cursor = start;
    while (cursor <= end) {
      set.add(toBrisbaneDayKey(cursor));
      cursor = addDays(cursor, 1);
    }
  });
  return set;
}

function nextScheduledOccurrence(cursor: Date, endDate: Date | null, skippedDates: Set<string>) {
  let next = cursor;
  while (!endDate || next <= endDate) {
    const key = toBrisbaneDayKey(next);
    if (!skippedDates.has(key)) return next;
    next = addDays(next, 7);
  }
  return null;
}

export function computeBlockCoverageRange(params: {
  currentPaidThroughDate?: Date | null;
  enrolmentStartDate: Date;
  enrolmentEndDate?: Date | null;
  classTemplate: PaidThroughTemplate;
  assignedTemplates?: PaidThroughTemplate[];
  blockClassCount: number;
  blocksPurchased?: number;
  creditsPurchased?: number;
  holidays: HolidayRange[];
}): BlockCoverageResult {
  const blocksPurchased = Math.max(params.blocksPurchased ?? 0, 0);
  const blockClassCount = Math.max(params.blockClassCount, 0);
  const creditsPurchased = Math.max(
    params.creditsPurchased ?? blockClassCount * blocksPurchased,
    0
  );

  if (!creditsPurchased) {
    return {
      coverageStart: null,
      coverageEnd: null,
      coverageEndBase: null,
      creditsPurchased: 0,
    };
  }

  const templates = params.assignedTemplates?.length ? params.assignedTemplates : [params.classTemplate];

  const baseDate = params.currentPaidThroughDate
    ? addDays(brisbaneStartOfDay(params.currentPaidThroughDate), 1)
    : brisbaneStartOfDay(params.enrolmentStartDate);

  const baseDayKey = toBrisbaneDayKey(baseDate);
  const enrolmentEndDayKey = params.enrolmentEndDate ? toBrisbaneDayKey(brisbaneStartOfDay(params.enrolmentEndDate)) : null;

  const coverageStartDayKey = nextScheduledDayKey({
    startDayKey: baseDayKey,
    assignedTemplates: templates,
    holidays: params.holidays,
    endDayKey: enrolmentEndDayKey,
  });

  const coverageStart = dayKeyToDate(coverageStartDayKey);

  if (!coverageStart) {
    return {
      coverageStart: null,
      coverageEnd: null,
      coverageEndBase: null,
      creditsPurchased,
    };
  }

  const projectionDayKey = computeCoverageEndDay({
    startDayKey: coverageStartDayKey!,
    assignedTemplates: templates,
    holidays: params.holidays,
    entitlementSessions: creditsPurchased,
    endDayKey: enrolmentEndDayKey,
  });

  const projectionBaseDayKey = computeCoverageEndDay({
    startDayKey: coverageStartDayKey!,
    assignedTemplates: templates,
    holidays: [],
    entitlementSessions: creditsPurchased,
    endDayKey: enrolmentEndDayKey,
  });

  if (process.env.DEBUG_BLOCK_COVERAGE === "1") {
    console.debug(
      `[blockCoverage] start=${toBrisbaneDayKey(coverageStart)} ` +
        `end=${projectionDayKey ?? "null"} ` +
        `baseEnd=${projectionBaseDayKey ?? "null"} ` +
        `credits=${creditsPurchased}`
    );
  }

  return {
    coverageStart,
    coverageEnd: dayKeyToDate(projectionDayKey),
    coverageEndBase: dayKeyToDate(projectionBaseDayKey),
    creditsPurchased,
  };
}

export function calculatePaidThroughDate(options: PaidThroughOptions): PaidThroughResult {
  const templateDay = options.classTemplate.dayOfWeek;
  if (templateDay === null || templateDay === undefined) {
    return {
      paidThroughDate: null,
      nextDueDate: null,
      coveredOccurrences: 0,
      remainingCredits: options.creditsToCover,
    };
  }

  const start = scheduleDateAtUtcMidnight(brisbaneStartOfDay(options.startDate));
  const end = options.endDate ? scheduleDateAtUtcMidnight(brisbaneStartOfDay(options.endDate)) : null;

  if (end && isAfter(start, end)) {
    return {
      paidThroughDate: null,
      nextDueDate: null,
      coveredOccurrences: 0,
      remainingCredits: options.creditsToCover,
    };
  }

  const startDay = brisbaneDayOfWeek(start);
  const delta = (templateDay - startDay + 7) % 7;
  let cursor = addDays(start, delta);

  const holidayDates = buildHolidayDateSet(options.holidays);
  const cancellationDates = buildSkippedDateSet(options.cancellations ?? []);
  const skippedDates = new Set<string>([...holidayDates, ...cancellationDates]);

  const debugEnabled = process.env.DEBUG_PAID_THROUGH === "1";
  const debugEntries: string[] = [];

  if (options.creditsToCover <= 0) {
    const nextDue = nextScheduledOccurrence(cursor, end, skippedDates);
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
    const key = toBrisbaneDayKey(cursor);
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
      `[paidThrough] credits=${options.creditsToCover} start=${toBrisbaneDayKey(start)} ` +
        `occurrences=${debugEntries.join(", ")}`
    );
  }

  const nextDue =
    paidThroughDate && remaining <= 0
      ? nextScheduledOccurrence(addDays(paidThroughDate, 7), end, skippedDates)
      : nextScheduledOccurrence(cursor, end, skippedDates);

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
}) {
  const templateDay = options.classTemplate.dayOfWeek;
  if (templateDay === null || templateDay === undefined) return [];

  const start = scheduleDateAtUtcMidnight(brisbaneStartOfDay(options.startDate));
  const end = scheduleDateAtUtcMidnight(brisbaneStartOfDay(options.endDate));

  if (isAfter(start, end)) return [];

  const startDay = brisbaneDayOfWeek(start);
  const delta = (templateDay - startDay + 7) % 7;
  let cursor = addDays(start, delta);

  const holidayDates = buildHolidayDateSet(options.holidays);
  const cancellationDates = buildSkippedDateSet(options.cancellations ?? []);
  const skippedDates = new Set<string>([...holidayDates, ...cancellationDates]);

  const occurrences: Date[] = [];
  while (cursor <= end) {
    const key = toBrisbaneDayKey(cursor);
    if (!skippedDates.has(key)) {
      occurrences.push(cursor);
    }
    cursor = addDays(cursor, 7);
  }
  return occurrences;
}
