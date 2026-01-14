import type { Prisma } from "@prisma/client";
import { addDays } from "date-fns";

import { prisma } from "@/lib/prisma";
import {
  brisbaneCompare,
  brisbaneDayOfWeek,
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

export type PaidThroughTemplateChangeResult = {
  newPaidThroughDate: Date | null;
  debugInfo: {
    enrolmentId: string;
    startDayKey: BrisbaneDayKey | null;
    oldPaidThroughDayKey: BrisbaneDayKey | null;
    newPaidThroughDayKey: BrisbaneDayKey | null;
    oldTemplateIds: string[];
    newTemplateIds: string[];
    entitlementSessions: number;
    sessionsPerWeek: number;
    horizonEndDayKey: BrisbaneDayKey | null;
    oldHolidayCount: number;
    newHolidayCount: number;
    oldCancellationCount: number;
    newCancellationCount: number;
  };
};

// Algorithm: preserve the number of entitled occurrences already covered by the old template(s),
// then map that count onto the new template(s) by walking Brisbane day keys (skipping holidays).
// - Count entitled occurrences on the CURRENT templates from enrolment start through paidThrough (inclusive).
// - Walk occurrences on the NEW templates, skipping holidays/cancellations, until the same count is reached.
// - The final occurrence date is the new paidThrough (inclusive).
// Root cause note: the previous class-change recalculation capped the new coverage to the old paid-through
// window (and limited holidays to that same window), which could back up the computed paid-through date when
// the weekday shifted and produced under-counted occurrences.
export async function computePaidThroughAfterTemplateChange(params: {
  enrolmentId: string;
  enrolmentStartDate: Date;
  enrolmentEndDate?: Date | null;
  oldPaidThroughDate: Date | null;
  oldTemplates: PaidThroughTemplateChangeTemplate[];
  newTemplates: PaidThroughTemplateChangeTemplate[];
  holidayOverrides?: { old: HolidayRange[]; new: HolidayRange[] };
  cancellationOverrides?: {
    old: Array<{ templateId: string; date: Date }>;
    new: Array<{ templateId: string; date: Date }>;
  };
  tx?: Prisma.TransactionClient;
}): Promise<PaidThroughTemplateChangeResult> {
  const startDate = brisbaneStartOfDay(params.enrolmentStartDate);
  const startDayKey = toBrisbaneDayKey(startDate);
  const oldPaidThroughDate = params.oldPaidThroughDate
    ? brisbaneStartOfDay(params.oldPaidThroughDate)
    : null;
  const oldPaidThroughDayKey = oldPaidThroughDate ? toBrisbaneDayKey(oldPaidThroughDate) : null;

  const emptyResult = (entitlementSessions: number, sessionsPerWeek: number) => ({
    newPaidThroughDate: null,
    debugInfo: {
      enrolmentId: params.enrolmentId,
      startDayKey,
      oldPaidThroughDayKey,
      newPaidThroughDayKey: null,
      oldTemplateIds: params.oldTemplates.map((template) => template.id),
      newTemplateIds: params.newTemplates.map((template) => template.id),
      entitlementSessions,
      sessionsPerWeek,
      horizonEndDayKey: null,
      oldHolidayCount: 0,
      newHolidayCount: 0,
      oldCancellationCount: 0,
      newCancellationCount: 0,
    },
  });

  if (!oldPaidThroughDate || !params.oldTemplates.length || !params.newTemplates.length) {
    return emptyResult(0, 0);
  }

  if (brisbaneCompare(oldPaidThroughDayKey!, startDayKey) < 0) {
    return emptyResult(0, 0);
  }

  const client = params.tx ?? prisma;

  const oldTemplateIds = params.oldTemplates.map((template) => template.id);
  const oldLevelIds = params.oldTemplates.map((template) => template.levelId ?? null);
  const newTemplateIds = params.newTemplates.map((template) => template.id);
  const newLevelIds = params.newTemplates.map((template) => template.levelId ?? null);

  const oldHolidayPromise = params.holidayOverrides
    ? Promise.resolve(params.holidayOverrides.old)
    : client.holiday.findMany({
        where: {
          startDate: { lte: oldPaidThroughDate },
          endDate: { gte: startDate },
          ...buildHolidayScopeWhere({ templateIds: oldTemplateIds, levelIds: oldLevelIds }),
        },
        select: { startDate: true, endDate: true },
      });

  const newHolidayPromise = params.holidayOverrides
    ? Promise.resolve(params.holidayOverrides.new)
    : client.holiday.findMany({
        where: {
          startDate: { lte: params.enrolmentEndDate ?? addDays(startDate, 365) },
          endDate: { gte: startDate },
          ...buildHolidayScopeWhere({ templateIds: newTemplateIds, levelIds: newLevelIds }),
        },
        select: { startDate: true, endDate: true },
      });

  const oldCancellationPromise = params.cancellationOverrides
    ? Promise.resolve(params.cancellationOverrides.old)
    : client.classCancellation.findMany({
        where: {
          templateId: { in: oldTemplateIds },
          date: { gte: startDate, lte: oldPaidThroughDate },
        },
        select: { templateId: true, date: true },
      });

  const newCancellationPromise = params.cancellationOverrides
    ? Promise.resolve(params.cancellationOverrides.new)
    : client.classCancellation.findMany({
        where: {
          templateId: { in: newTemplateIds },
          date: {
            gte: startDate,
            lte: params.enrolmentEndDate ?? addDays(startDate, 365),
          },
        },
        select: { templateId: true, date: true },
      });

  const [oldHolidays, newHolidays, oldCancellations, newCancellations] = await Promise.all([
    oldHolidayPromise,
    newHolidayPromise,
    oldCancellationPromise,
    newCancellationPromise,
  ]);

  const entitlementSessions = countScheduledSessionsWithSkips({
    startDayKey,
    endDayKey: oldPaidThroughDayKey!,
    templates: params.oldTemplates,
    holidays: oldHolidays,
    cancellations: oldCancellations,
  });

  const sessionsPerWeek = params.newTemplates.reduce((total, template) => {
    if (template.dayOfWeek == null) return total;
    return total + 1;
  }, 0);

  if (entitlementSessions <= 0 || sessionsPerWeek <= 0) {
    return emptyResult(entitlementSessions, sessionsPerWeek);
  }

  const weeksToCover = Math.max(1, Math.ceil(entitlementSessions / sessionsPerWeek));
  const horizon = params.enrolmentEndDate
    ? brisbaneStartOfDay(params.enrolmentEndDate)
    : addDays(startDate, (weeksToCover + 4) * 7);
  const horizonEndDayKey = toBrisbaneDayKey(horizon);

  const endDayKey = params.enrolmentEndDate
    ? toBrisbaneDayKey(brisbaneStartOfDay(params.enrolmentEndDate))
    : null;

  const newPaidThroughDayKey = computeCoverageEndDayWithSkips({
    startDayKey,
    assignedTemplates: params.newTemplates,
    holidays: newHolidays,
    cancellations: newCancellations,
    entitlementSessions,
    endDayKey,
  });

  if (process.env.DEBUG_PAID_THROUGH_CHANGE === "1") {
    console.debug(
      "[paidThroughChange]",
      {
        enrolmentId: params.enrolmentId,
        oldTemplateIds,
        newTemplateIds,
        oldPaidThroughDate: params.oldPaidThroughDate?.toISOString() ?? null,
        oldPaidThroughDayKey,
        startDayKey,
        entitlementSessions,
        sessionsPerWeek,
        newPaidThroughDayKey,
        horizonEndDayKey,
      }
    );
  }

  return {
    newPaidThroughDate: newPaidThroughDayKey ? brisbaneStartOfDay(newPaidThroughDayKey) : null,
    debugInfo: {
      enrolmentId: params.enrolmentId,
      startDayKey,
      oldPaidThroughDayKey,
      newPaidThroughDayKey,
      oldTemplateIds,
      newTemplateIds,
      entitlementSessions,
      sessionsPerWeek,
      horizonEndDayKey,
      oldHolidayCount: oldHolidays.length,
      newHolidayCount: newHolidays.length,
      oldCancellationCount: oldCancellations.length,
      newCancellationCount: newCancellations.length,
    },
  };
}

export function describeTemplate(template: PaidThroughTemplateChangeTemplate) {
  return {
    id: template.id,
    name: template.name ?? "Class",
    dayOfWeek: template.dayOfWeek ?? null,
  };
}

// (intentionally no additional helpers exported; keep computations centralized above)

type TemplateSchedule = {
  id: string;
  dayOfWeek: number | null;
  startDayKey: BrisbaneDayKey | null;
  endDayKey: BrisbaneDayKey | null;
};

function buildTemplateSchedules(templates: PaidThroughTemplateChangeTemplate[]): TemplateSchedule[] {
  return templates.map((template) => ({
    id: template.id,
    dayOfWeek: template.dayOfWeek,
    startDayKey: template.startDate ? toBrisbaneDayKey(template.startDate) : null,
    endDayKey: template.endDate ? toBrisbaneDayKey(template.endDate) : null,
  }));
}

function buildCancellationSet(cancellations: Array<{ templateId: string; date: Date }>) {
  const set = new Set<string>();
  cancellations.forEach((cancellation) => {
    set.add(`${cancellation.templateId}:${toBrisbaneDayKey(cancellation.date)}`);
  });
  return set;
}

function isTemplateActiveOnDay(template: TemplateSchedule, dayKey: BrisbaneDayKey) {
  if (template.startDayKey && brisbaneCompare(dayKey, template.startDayKey) < 0) return false;
  if (template.endDayKey && brisbaneCompare(dayKey, template.endDayKey) > 0) return false;
  return true;
}

function groupTemplatesByDay(templates: TemplateSchedule[]) {
  const map = new Map<number, TemplateSchedule[]>();
  templates.forEach((template) => {
    if (template.dayOfWeek == null) return;
    const day = ((template.dayOfWeek % 7) + 7) % 7;
    const bucket = map.get(day) ?? [];
    bucket.push(template);
    map.set(day, bucket);
  });
  return map;
}

function countScheduledSessionsWithSkips(params: {
  startDayKey: BrisbaneDayKey;
  endDayKey: BrisbaneDayKey;
  templates: PaidThroughTemplateChangeTemplate[];
  holidays: HolidayRange[];
  cancellations: Array<{ templateId: string; date: Date }>;
}) {
  if (brisbaneCompare(params.endDayKey, params.startDayKey) < 0) return 0;
  const templateSchedules = buildTemplateSchedules(params.templates);
  const templatesByDay = groupTemplatesByDay(templateSchedules);
  if (!templatesByDay.size) return 0;

  const holidaySet = buildHolidayDayKeySet(params.holidays);
  const cancellationSet = buildCancellationSet(params.cancellations);

  let total = 0;
  let cursor = params.startDayKey;
  while (brisbaneCompare(cursor, params.endDayKey) <= 0) {
    if (!holidaySet.has(cursor)) {
      const dayTemplates = templatesByDay.get(brisbaneDayOfWeek(cursor)) ?? [];
      dayTemplates.forEach((template) => {
        if (!isTemplateActiveOnDay(template, cursor)) return;
        if (cancellationSet.has(`${template.id}:${cursor}`)) return;
        total += 1;
      });
    }
    cursor = addDaysFromDayKey(cursor, 1);
  }
  return total;
}

function computeCoverageEndDayWithSkips(params: {
  startDayKey: BrisbaneDayKey;
  assignedTemplates: PaidThroughTemplateChangeTemplate[];
  holidays: HolidayRange[];
  cancellations: Array<{ templateId: string; date: Date }>;
  entitlementSessions: number;
  endDayKey?: BrisbaneDayKey | null;
}) {
  if (params.entitlementSessions <= 0) return null;
  const templateSchedules = buildTemplateSchedules(params.assignedTemplates);
  const templatesByDay = groupTemplatesByDay(templateSchedules);
  if (!templatesByDay.size) return null;

  const holidaySet = buildHolidayDayKeySet(params.holidays);
  const cancellationSet = buildCancellationSet(params.cancellations);

  let remaining = params.entitlementSessions;
  let cursor = params.startDayKey;
  let lastCovered: BrisbaneDayKey | null = null;

  while (remaining > 0 && (!params.endDayKey || brisbaneCompare(cursor, params.endDayKey) <= 0)) {
    if (!holidaySet.has(cursor)) {
      const dayTemplates = templatesByDay.get(brisbaneDayOfWeek(cursor)) ?? [];
      dayTemplates.forEach((template) => {
        if (remaining <= 0) return;
        if (!isTemplateActiveOnDay(template, cursor)) return;
        if (cancellationSet.has(`${template.id}:${cursor}`)) return;
        remaining -= 1;
        lastCovered = cursor;
      });
    }
    cursor = addDaysFromDayKey(cursor, 1);
  }

  return lastCovered;
}

function addDaysFromDayKey(dayKey: BrisbaneDayKey, amount: number) {
  const base = brisbaneStartOfDay(dayKey);
  return toBrisbaneDayKey(addDays(base, amount));
}
