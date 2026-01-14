import type { Prisma } from "@prisma/client";
import { addDays } from "date-fns";

import { prisma } from "@/lib/prisma";
import {
  brisbaneCompare,
  brisbaneStartOfDay,
  toBrisbaneDayKey,
  type BrisbaneDayKey,
} from "@/server/dates/brisbaneDay";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import type { HolidayRange } from "@/server/holiday/holidayUtils";
import {
  computeCoverageEndDay,
  countScheduledSessionsExcludingHolidays,
} from "@/server/billing/coverageEngine";

export type PaidThroughTemplateChangeTemplate = {
  id: string;
  dayOfWeek: number | null;
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
  };
};

// Algorithm: preserve the number of entitled occurrences already covered by the old template(s),
// then map that count onto the new template(s) by walking Brisbane day keys (skipping holidays).
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

  const [oldHolidays, newHolidays] = params.holidayOverrides
    ? [params.holidayOverrides.old, params.holidayOverrides.new]
    : await Promise.all([
        client.holiday.findMany({
          where: {
            startDate: { lte: oldPaidThroughDate },
            endDate: { gte: startDate },
            ...buildHolidayScopeWhere({ templateIds: oldTemplateIds, levelIds: oldLevelIds }),
          },
          select: { startDate: true, endDate: true },
        }),
        client.holiday.findMany({
          where: {
            startDate: { lte: params.enrolmentEndDate ?? addDays(startDate, 365) },
            endDate: { gte: startDate },
            ...buildHolidayScopeWhere({ templateIds: newTemplateIds, levelIds: newLevelIds }),
          },
          select: { startDate: true, endDate: true },
        }),
      ]);

  const entitlementSessions = countScheduledSessionsExcludingHolidays({
    startDayKey,
    endDayKey: oldPaidThroughDayKey!,
    assignedTemplates: params.oldTemplates,
    holidays: oldHolidays,
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

  const newPaidThroughDayKey = computeCoverageEndDay({
    startDayKey,
    assignedTemplates: params.newTemplates,
    holidays: newHolidays,
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
