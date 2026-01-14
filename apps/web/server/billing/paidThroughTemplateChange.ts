import type { Prisma } from "@prisma/client";
import { addDays } from "date-fns";

import { prisma } from "@/lib/prisma";
import {
  brisbaneCompare,
  brisbaneDayOfWeek,
  brisbaneAddDays,
  brisbaneStartOfDay,
  toBrisbaneDayKey,
  type BrisbaneDayKey,
} from "@/server/dates/brisbaneDay";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import type { HolidayRange } from "@/server/holiday/holidayUtils";
import { buildHolidayDayKeySet } from "@/server/billing/coverageEngine";

export type PaidThroughTemplateChangeTemplate = {
  id: string;
  dayOfWeek: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  levelId?: string | null;
  name?: string | null;
};

export async function computePaidThroughAfterTemplateChange(params: {
  enrolmentId: string;
  oldTemplateId: string | null;
  newTemplateId: string | null;
  paidThroughDate: Date | null;
  overrides?: {
    enrolment?: { startDate: Date; endDate?: Date | null };
    oldTemplate?: PaidThroughTemplateChangeTemplate | null;
    newTemplate?: PaidThroughTemplateChangeTemplate | null;
    holidays?: { old: HolidayRange[]; new: HolidayRange[] };
    cancellations?: {
      old: Array<{ templateId: string; date: Date }>;
      new: Array<{ templateId: string; date: Date }>;
    };
  };
  tx?: Prisma.TransactionClient;
}): Promise<Date | null> {
  if (!params.paidThroughDate || !params.oldTemplateId || !params.newTemplateId) return null;

  const client = params.tx ?? prisma;
  const enrolment =
    params.overrides?.enrolment ??
    (await client.enrolment.findUnique({
      where: { id: params.enrolmentId },
      select: { startDate: true, endDate: true },
    }));

  if (!enrolment) return null;

  const [oldTemplate, newTemplate] = await Promise.all([
    params.overrides?.oldTemplate ??
      client.classTemplate.findUnique({
        where: { id: params.oldTemplateId },
        select: { id: true, dayOfWeek: true, startDate: true, endDate: true, levelId: true, name: true },
      }),
    params.overrides?.newTemplate ??
      client.classTemplate.findUnique({
        where: { id: params.newTemplateId },
        select: { id: true, dayOfWeek: true, startDate: true, endDate: true, levelId: true, name: true },
      }),
  ]);

  if (!oldTemplate || !newTemplate) return null;

  const startDate = brisbaneStartOfDay(enrolment.startDate);
  const paidThroughDate = brisbaneStartOfDay(params.paidThroughDate);
  const startDayKey = toBrisbaneDayKey(startDate);
  const paidThroughDayKey = toBrisbaneDayKey(paidThroughDate);

  if (brisbaneCompare(paidThroughDayKey, startDayKey) < 0) return null;

  const oldTemplateStart = oldTemplate.startDate ? brisbaneStartOfDay(oldTemplate.startDate) : startDate;
  const oldTemplateEnd = oldTemplate.endDate ? brisbaneStartOfDay(oldTemplate.endDate) : null;
  const newTemplateStart = newTemplate.startDate ? brisbaneStartOfDay(newTemplate.startDate) : startDate;
  const newTemplateEnd = newTemplate.endDate ? brisbaneStartOfDay(newTemplate.endDate) : null;
  const enrolmentEnd = enrolment.endDate ? brisbaneStartOfDay(enrolment.endDate) : null;

  // ✅ oldRangeStart is ALWAYS a Date
  const oldRangeStart: Date = maxBrisbaneDate(startDate, oldTemplateStart);
  const oldRangeEnd = minBrisbaneDate(paidThroughDate, oldTemplateEnd, enrolmentEnd);

  if (!oldRangeEnd || brisbaneCompare(toBrisbaneDayKey(oldRangeEnd), toBrisbaneDayKey(oldRangeStart)) < 0) {
    return null;
  }

  const oldRangeStartKey = toBrisbaneDayKey(oldRangeStart);
  const oldRangeEndKey = toBrisbaneDayKey(oldRangeEnd);

  const weeksToCoverGuess = countOccurrencesBetween({
    startDayKey: oldRangeStartKey,
    endDayKey: oldRangeEndKey,
    template: oldTemplate,
    holidays: [],
    cancellations: [],
  });

  const horizonEndDate = enrolmentEnd ?? addDays(startDate, (Math.max(1, weeksToCoverGuess) + 4) * 7);

  const [oldHolidays, newHolidays, oldCancellations, newCancellations] = await Promise.all([
    params.overrides?.holidays?.old ??
      client.holiday.findMany({
        where: {
          startDate: { lte: oldRangeEnd },
          endDate: { gte: oldRangeStart },
          ...buildHolidayScopeWhere({ templateIds: [oldTemplate.id], levelIds: [oldTemplate.levelId ?? null] }),
        },
        select: { startDate: true, endDate: true },
      }),
    params.overrides?.holidays?.new ??
      client.holiday.findMany({
        where: {
          startDate: { lte: horizonEndDate },
          endDate: { gte: startDate },
          ...buildHolidayScopeWhere({ templateIds: [newTemplate.id], levelIds: [newTemplate.levelId ?? null] }),
        },
        select: { startDate: true, endDate: true },
      }),
    params.overrides?.cancellations?.old ??
      client.classCancellation.findMany({
        where: {
          templateId: oldTemplate.id,
          date: { gte: oldRangeStart, lte: oldRangeEnd },
        },
        select: { templateId: true, date: true },
      }),
    params.overrides?.cancellations?.new ??
      client.classCancellation.findMany({
        where: {
          templateId: newTemplate.id,
          date: { gte: startDate, lte: horizonEndDate },
        },
        select: { templateId: true, date: true },
      }),
  ]);

  const entitlementSessions = countOccurrencesBetween({
    startDayKey: oldRangeStartKey,
    endDayKey: oldRangeEndKey,
    template: oldTemplate,
    holidays: oldHolidays,
    cancellations: oldCancellations,
  });

  if (entitlementSessions <= 0) return null;

  // ✅ newRangeStart is ALWAYS a Date
  const newRangeStart: Date = maxBrisbaneDate(startDate, newTemplateStart);
  const newRangeEnd = minBrisbaneDate(horizonEndDate, newTemplateEnd, enrolmentEnd);
  const newRangeStartKey = toBrisbaneDayKey(newRangeStart);
  const newRangeEndKey = newRangeEnd ? toBrisbaneDayKey(newRangeEnd) : null;

  const newPaidThroughKey = findNthOccurrence({
    startDayKey: newRangeStartKey,
    endDayKey: newRangeEndKey,
    template: newTemplate,
    holidays: newHolidays,
    cancellations: newCancellations,
    count: entitlementSessions,
  });

  return newPaidThroughKey ? brisbaneStartOfDay(newPaidThroughKey) : null;
}

export function describeTemplate(template: PaidThroughTemplateChangeTemplate) {
  return {
    id: template.id,
    name: template.name ?? "Class",
    dayOfWeek: template.dayOfWeek ?? null,
  };
}

function buildCancellationSet(cancellations: Array<{ templateId: string; date: Date }>) {
  const set = new Set<string>();
  cancellations.forEach((cancellation) => {
    set.add(`${cancellation.templateId}:${toBrisbaneDayKey(cancellation.date)}`);
  });
  return set;
}

function countOccurrencesBetween(params: {
  startDayKey: BrisbaneDayKey;
  endDayKey: BrisbaneDayKey;
  template: PaidThroughTemplateChangeTemplate;
  holidays: HolidayRange[];
  cancellations: Array<{ templateId: string; date: Date }>;
}) {
  if (params.template.dayOfWeek == null) return 0;
  if (brisbaneCompare(params.endDayKey, params.startDayKey) < 0) return 0;

  const holidaySet = buildHolidayDayKeySet(params.holidays);
  const cancellationSet = buildCancellationSet(params.cancellations);

  const startDayOfWeek = brisbaneDayOfWeek(params.startDayKey);
  const delta = (params.template.dayOfWeek - startDayOfWeek + 7) % 7;
  let cursor = brisbaneAddDays(params.startDayKey, delta);

  let total = 0;
  while (brisbaneCompare(cursor, params.endDayKey) <= 0) {
    if (!holidaySet.has(cursor) && !cancellationSet.has(`${params.template.id}:${cursor}`)) {
      total += 1;
    }
    cursor = brisbaneAddDays(cursor, 7);
  }
  return total;
}

function findNthOccurrence(params: {
  startDayKey: BrisbaneDayKey;
  endDayKey?: BrisbaneDayKey | null;
  template: PaidThroughTemplateChangeTemplate;
  holidays: HolidayRange[];
  cancellations: Array<{ templateId: string; date: Date }>;
  count: number;
}) {
  if (params.template.dayOfWeek == null || params.count <= 0) return null;

  const holidaySet = buildHolidayDayKeySet(params.holidays);
  const cancellationSet = buildCancellationSet(params.cancellations);

  const startDayOfWeek = brisbaneDayOfWeek(params.startDayKey);
  const delta = (params.template.dayOfWeek - startDayOfWeek + 7) % 7;
  let cursor = brisbaneAddDays(params.startDayKey, delta);
  let remaining = params.count;
  let lastCovered: BrisbaneDayKey | null = null;

  while (remaining > 0 && (!params.endDayKey || brisbaneCompare(cursor, params.endDayKey) <= 0)) {
    if (!holidaySet.has(cursor) && !cancellationSet.has(`${params.template.id}:${cursor}`)) {
      remaining -= 1;
      lastCovered = cursor;
    }
    cursor = brisbaneAddDays(cursor, 7);
  }

  return lastCovered;
}

/**
 * Avoid name collisions with other helpers (date-fns, shared utils, etc).
 * Always returns a Date.
 */
function maxBrisbaneDate(base: Date, ...candidates: Array<Date | null | undefined>): Date {
  let max = base;

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate > max) max = candidate;
  }

  return max;
}


/**
 * Always returns Date or null (never undefined).
 */
function minBrisbaneDate(base: Date, ...candidates: Array<Date | null | undefined>): Date | null {
  const all: Date[] = [base, ...candidates].filter((d): d is Date => d != null);
  if (all.length === 0) return null;
  return all.reduce((min, d) => (d < min ? d : min), all[0]);
}
