import type { HolidayRange } from "@/server/holiday/holidayUtils";

import {
  brisbaneAddDays,
  brisbaneCompare,
  brisbaneStartOfDay,
  toBrisbaneDayKey,
} from "@/server/dates/brisbaneDay";
import {
  computeCoverageEndDay,
  countScheduledSessionsExcludingHolidays,
  nextScheduledDayKey,
  dayKeyToDate,
} from "@/server/billing/coverageEngine";
import { computeBlockCoverageRange } from "@/server/billing/paidThroughDate";

export type WeeklyCatchUpParams = {
  enrolmentStartDate: Date;
  enrolmentEndDate: Date | null;
  paidThroughDate: Date | null;
  durationWeeks: number;
  sessionsPerWeek: number | null;
  assignedTemplates: { dayOfWeek: number | null }[];
  holidays: HolidayRange[];
};

export type BlockCatchUpParams = {
  enrolmentStartDate: Date;
  enrolmentEndDate: Date | null;
  paidThroughDate: Date | null;
  classTemplate: { dayOfWeek: number | null; startTime?: number | null };
  blockClassCount: number;
  holidays: HolidayRange[];
};

function resolveSessionsPerWeek(value: number | null) {
  return value && value > 0 ? value : 1;
}

function resolveStartDayKey(params: {
  enrolmentStartDate: Date;
  paidThroughDate: Date | null;
  assignedTemplates: { dayOfWeek: number | null }[];
  holidays: HolidayRange[];
  enrolmentEndDayKey: string | null;
}) {
  const baseDayKey = params.paidThroughDate
    ? brisbaneAddDays(toBrisbaneDayKey(params.paidThroughDate), 1)
    : toBrisbaneDayKey(params.enrolmentStartDate);

  return nextScheduledDayKey({
    startDayKey: baseDayKey,
    assignedTemplates: params.assignedTemplates,
    holidays: params.holidays,
    endDayKey: params.enrolmentEndDayKey,
  });
}

export function resolveWeeklyBlocksToCurrent(params: WeeklyCatchUpParams, today: Date) {
  if (params.durationWeeks <= 0) {
    throw new Error("Weekly plans require durationWeeks to be greater than zero.");
  }

  const enrolmentEndDayKey = params.enrolmentEndDate ? toBrisbaneDayKey(params.enrolmentEndDate) : null;
  const startDayKey = resolveStartDayKey({
    enrolmentStartDate: params.enrolmentStartDate,
    paidThroughDate: params.paidThroughDate,
    assignedTemplates: params.assignedTemplates,
    holidays: params.holidays,
    enrolmentEndDayKey,
  });

  if (!startDayKey) return 0;

  const todayDayKey = toBrisbaneDayKey(brisbaneStartOfDay(today));
  if (brisbaneCompare(todayDayKey, startDayKey) < 0) return 0;

  const endDayKey = enrolmentEndDayKey && brisbaneCompare(enrolmentEndDayKey, todayDayKey) < 0 ? enrolmentEndDayKey : todayDayKey;

  const sessionsPerWeek = resolveSessionsPerWeek(params.sessionsPerWeek);
  const entitlementSessions = params.durationWeeks * sessionsPerWeek;

  const scheduled = countScheduledSessionsExcludingHolidays({
    startDayKey,
    endDayKey,
    assignedTemplates: params.assignedTemplates,
    holidays: params.holidays,
  });

  if (scheduled <= 0) return 0;

  return Math.ceil(scheduled / entitlementSessions);
}

export function resolveWeeklyCatchUpCoverage(params: WeeklyCatchUpParams, blocksBilled: number) {
  if (blocksBilled <= 0) {
    return { coverageStart: null, coverageEnd: null, coverageEndBase: null };
  }

  if (params.durationWeeks <= 0) {
    throw new Error("Weekly plans require durationWeeks to be greater than zero.");
  }

  const enrolmentEndDayKey = params.enrolmentEndDate ? toBrisbaneDayKey(params.enrolmentEndDate) : null;
  const startDayKey = resolveStartDayKey({
    enrolmentStartDate: params.enrolmentStartDate,
    paidThroughDate: params.paidThroughDate,
    assignedTemplates: params.assignedTemplates,
    holidays: params.holidays,
    enrolmentEndDayKey,
  });

  if (!startDayKey) {
    return { coverageStart: null, coverageEnd: null, coverageEndBase: null };
  }

  const sessionsPerWeek = resolveSessionsPerWeek(params.sessionsPerWeek);
  const entitlementSessions = params.durationWeeks * sessionsPerWeek * blocksBilled;

  const coverageEndDayKey = computeCoverageEndDay({
    startDayKey,
    assignedTemplates: params.assignedTemplates,
    holidays: params.holidays,
    entitlementSessions,
    endDayKey: enrolmentEndDayKey,
  });

  const coverageEndBaseDayKey = computeCoverageEndDay({
    startDayKey,
    assignedTemplates: params.assignedTemplates,
    holidays: [],
    entitlementSessions,
    endDayKey: enrolmentEndDayKey,
  });

  return {
    coverageStart: dayKeyToDate(startDayKey),
    coverageEnd: dayKeyToDate(coverageEndDayKey),
    coverageEndBase: dayKeyToDate(coverageEndBaseDayKey),
  };
}

export function resolveBlockBlocksToCurrent(params: {
  remainingCredits: number | null;
  paidThroughDate: Date | null;
  blockClassCount: number;
  today: Date;
}) {
  const todayDayKey = toBrisbaneDayKey(brisbaneStartOfDay(params.today));
  if (params.paidThroughDate) {
    const paidKey = toBrisbaneDayKey(brisbaneStartOfDay(params.paidThroughDate));
    if (brisbaneCompare(paidKey, todayDayKey) >= 0) return 0;
  }

  const remaining = params.remainingCredits ?? 0;
  if (remaining > 0) return 0;

  const neededCredits = Math.max(1 - remaining, 1);
  return Math.ceil(neededCredits / params.blockClassCount);
}

export function resolveBlockCatchUpCoverage(params: BlockCatchUpParams, blocksBilled: number) {
  const blockClassCount = Math.max(params.blockClassCount, 1);
  if (blocksBilled <= 0) {
    return {
      coverageStart: null,
      coverageEnd: null,
      coverageEndBase: null,
      creditsPurchased: 0,
    };
  }

  return computeBlockCoverageRange({
    currentPaidThroughDate: params.paidThroughDate ?? null,
    enrolmentStartDate: params.enrolmentStartDate,
    enrolmentEndDate: params.enrolmentEndDate ?? null,
    classTemplate: params.classTemplate,
    blockClassCount,
    blocksPurchased: blocksBilled,
    creditsPurchased: blockClassCount * blocksBilled,
    holidays: params.holidays,
  });
}
